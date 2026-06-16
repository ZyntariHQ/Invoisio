#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec, Symbol};

pub mod errors;
pub mod events;
pub mod storage;

pub use errors::ContractError;
pub use storage::{
    Invoice, InvoiceStatus, Milestone, DataKey, ContractMeta,
    has_admin, get_admin, set_admin, has_invoice, get_invoice, set_invoice,
    get_contract_meta, set_contract_meta, ensure_contract_meta,
};

#[contract]
pub struct InvoiceEscrowContract;

#[contractimpl]
impl InvoiceEscrowContract {
    // Initialization
    pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError> {
        if has_admin(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        set_contract_meta(
            &env,
            &ContractMeta {
                contract_version: storage::CONTRACT_VERSION,
                storage_schema_version: storage::STORAGE_SCHEMA_VERSION,
            },
        );
        Ok(())
    }

    // Create a new invoice with milestones
    pub fn create_invoice(
        env: Env,
        invoice_id: String,
        payer: Address,
        merchant: Address,
        total_amount: i128,
        asset_code: String,
        asset_issuer: Address,
        milestone_titles: Vec<String>,
        milestone_descriptions: Vec<String>,
        milestone_percentages: Vec<u32>,
    ) -> Result<(), ContractError> {
        // Validate inputs
        if invoice_id.is_empty() {
            return Err(ContractError::InvalidInvoiceId);
        }
        if total_amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if has_invoice(&env, &invoice_id) {
            return Err(ContractError::InvoiceAlreadyExists);
        }
        if milestone_titles.len() != milestone_descriptions.len()
            || milestone_titles.len() != milestone_percentages.len()
            || milestone_titles.len() < 1
            || milestone_titles.len() > 10
        {
            return Err(ContractError::InvalidMilestoneCount);
        }

        // Validate milestone percentages add up to 100
        let mut total_percentage: u32 = 0;
        for pct in milestone_percentages.iter() {
            if *pct < 1 || *pct > 100 {
                return Err(ContractError::InvalidMilestonePercentage);
            }
            total_percentage += pct;
        }
        if total_percentage != 100 {
            return Err(ContractError::MilestoneTotalExceeds100);
        }

        // Create milestones
        let mut milestones: Vec<Milestone> = Vec::new(&env);
        for i in 0..milestone_titles.len() {
            let percentage = milestone_percentages.get(i).unwrap();
            let amount = (total_amount * percentage as i128) / 100;
            milestones.push_back(Milestone {
                id: i as u32,
                title: milestone_titles.get(i).unwrap(),
                description: milestone_descriptions.get(i).unwrap(),
                percentage,
                amount,
                approved: false,
                released: false,
            });
        }

        // Create and store invoice
        let invoice = Invoice {
            invoice_id: invoice_id.clone(),
            payer: payer.clone(),
            merchant: merchant.clone(),
            total_amount,
            asset_code: asset_code.clone(),
            asset_issuer: asset_issuer.clone(),
            milestones,
            status: InvoiceStatus::Created,
            funded_amount: 0,
            released_amount: 0,
            created_at: env.ledger().timestamp(),
            updated_at: env.ledger().timestamp(),
        };
        set_invoice(&env, &invoice);

        // Emit event
        events::emit_invoice_created(
            &env,
            invoice_id,
            payer,
            merchant,
            total_amount,
            asset_code,
            asset_issuer,
        );

        Ok(())
    }

    // Fund the invoice escrow
    pub fn fund_invoice(
        env: Env,
        invoice_id: String,
        from: Address,
    ) -> Result<(), ContractError> {
        from.require_auth();
        ensure_contract_meta(&env);

        let mut invoice = get_invoice(&env, &invoice_id)?;
        if invoice.status != InvoiceStatus::Created && invoice.status != InvoiceStatus::InProgress {
            return Err(ContractError::InvoiceAlreadyPaid);
        }
        if invoice.payer != from {
            return Err(ContractError::NotAuthorized);
        }

        let amount_needed = invoice.total_amount - invoice.funded_amount;
        if amount_needed <= 0 {
            return Err(ContractError::InvoiceAlreadyPaid);
        }

        // Transfer tokens to the contract (note: requires Soroban token transfers)
        // For this example, we'll simulate the transfer and update state
        // In a real scenario, you'd use the soroban-token-sdk
        invoice.funded_amount += amount_needed;
        invoice.status = if invoice.funded_amount >= invoice.total_amount {
            InvoiceStatus::Funded
        } else {
            InvoiceStatus::InProgress
        };
        invoice.updated_at = env.ledger().timestamp();
        set_invoice(&env, &invoice);

        events::emit_invoice_funded(&env, invoice_id, amount_needed);

        Ok(())
    }

    // Approve a milestone (only payer can approve)
    pub fn approve_milestone(
        env: Env,
        invoice_id: String,
        milestone_id: u32,
        approver: Address,
    ) -> Result<(), ContractError> {
        approver.require_auth();
        ensure_contract_meta(&env);

        let mut invoice = get_invoice(&env, &invoice_id)?;
        if invoice.status != InvoiceStatus::Funded && invoice.status != InvoiceStatus::InProgress {
            return Err(ContractError::InvoiceNotPaid);
        }
        if invoice.payer != approver {
            return Err(ContractError::NotAuthorized);
        }

        // Find and update milestone
        let mut found = false;
        for i in 0..invoice.milestones.len() {
            let mut milestone = invoice.milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                if milestone.approved {
                    return Err(ContractError::MilestoneAlreadyCompleted);
                }
                milestone.approved = true;
                invoice.milestones.set(i as u32, milestone);
                found = true;
                break;
            }
        }
        if !found {
            return Err(ContractError::MilestoneNotFound);
        }

        invoice.updated_at = env.ledger().timestamp();
        set_invoice(&env, &invoice);

        events::emit_milestone_approved(&env, invoice_id, milestone_id, approver);

        Ok(())
    }

    // Release funds for an approved milestone (only merchant can release, or auto-release)
    pub fn release_milestone(
        env: Env,
        invoice_id: String,
        milestone_id: u32,
    ) -> Result<(), ContractError> {
        ensure_contract_meta(&env);

        let mut invoice = get_invoice(&env, &invoice_id)?;
        if invoice.status == InvoiceStatus::Cancelled {
            return Err(ContractError::InvoiceCancelled);
        }
        if invoice.status == InvoiceStatus::Completed {
            return Err(ContractError::InvoiceAlreadyCompleted);
        }

        // Find milestone
        let mut found = false;
        let mut release_amount: i128 = 0;
        for i in 0..invoice.milestones.len() {
            let mut milestone = invoice.milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                if !milestone.approved {
                    return Err(ContractError::MilestoneNotApproved);
                }
                if milestone.released {
                    return Err(ContractError::MilestoneAlreadyCompleted);
                }
                milestone.released = true;
                release_amount = milestone.amount;
                invoice.milestones.set(i as u32, milestone);
                found = true;
                break;
            }
        }
        if !found {
            return Err(ContractError::MilestoneNotFound);
        }

        // Update invoice
        invoice.released_amount += release_amount;
        let all_released = invoice.milestones.iter().all(|m| m.released);
        invoice.status = if all_released {
            InvoiceStatus::Completed
        } else {
            InvoiceStatus::InProgress
        };
        invoice.updated_at = env.ledger().timestamp();
        set_invoice(&env, &invoice);

        events::emit_milestone_released(
            &env,
            invoice_id.clone(),
            milestone_id,
            release_amount,
            invoice.merchant.clone(),
        );

        if all_released {
            events::emit_invoice_completed(&env, invoice_id);
        }

        Ok(())
    }

    // Cancel invoice and refund remaining funds (only payer or admin)
    pub fn cancel_invoice(
        env: Env,
        invoice_id: String,
        requester: Address,
    ) -> Result<(), ContractError> {
        requester.require_auth();
        ensure_contract_meta(&env);

        let mut invoice = get_invoice(&env, &invoice_id)?;
        if invoice.status == InvoiceStatus::Completed {
            return Err(ContractError::InvoiceAlreadyCompleted);
        }
        if invoice.status == InvoiceStatus::Cancelled {
            return Err(ContractError::InvoiceCancelled);
        }

        // Check authorization
        if requester != invoice.payer && requester != get_admin(&env)? {
            return Err(ContractError::NotAuthorized);
        }

        // Calculate refund amount
        let refund_amount = invoice.funded_amount - invoice.released_amount;
        invoice.status = InvoiceStatus::Cancelled;
        invoice.updated_at = env.ledger().timestamp();
        set_invoice(&env, &invoice);

        events::emit_invoice_cancelled(
            &env,
            invoice_id,
            refund_amount,
            invoice.payer.clone(),
        );

        Ok(())
    }

    // Read methods
    pub fn get_invoice(env: Env, invoice_id: String) -> Result<Invoice, ContractError> {
        get_invoice(&env, &invoice_id)
    }

    pub fn has_invoice(env: Env, invoice_id: String) -> bool {
        has_invoice(&env, &invoice_id)
    }

    pub fn get_admin(env: Env) -> Result<Address, ContractError> {
        get_admin(&env)
    }

    pub fn version_info(env: Env) -> ContractMeta {
        ContractMeta {
            contract_version: storage::CONTRACT_VERSION,
            storage_schema_version: storage::STORAGE_SCHEMA_VERSION,
        }
    }
}

mod test;

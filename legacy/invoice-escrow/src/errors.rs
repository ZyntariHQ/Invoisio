use soroban_sdk::{contracterror, Env, String};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    InvalidInvoiceId = 4,
    InvalidPayer = 5,
    InvalidMerchant = 6,
    InvalidAmount = 7,
    InvalidAsset = 8,
    InvalidMilestoneCount = 9,
    InvalidMilestonePercentage = 10,
    InvoiceAlreadyExists = 11,
    InvoiceNotFound = 12,
    InvoiceNotPaid = 13,
    InvoiceAlreadyCompleted = 14,
    InvoiceCancelled = 15,
    MilestoneNotFound = 16,
    MilestoneAlreadyCompleted = 17,
    MilestoneNotApproved = 18,
    InsufficientBalance = 19,
    TransferFailed = 20,
    MilestoneTotalExceeds100 = 21,
    InvoiceAlreadyPaid = 22,
}

impl ContractError {
    pub fn message(&self, _env: &Env) -> String {
        match self {
            ContractError::AlreadyInitialized => String::from_str(_env, "Contract already initialized"),
            ContractError::NotInitialized => String::from_str(_env, "Contract not initialized"),
            ContractError::NotAuthorized => String::from_str(_env, "Not authorized"),
            ContractError::InvalidInvoiceId => String::from_str(_env, "Invalid invoice ID"),
            ContractError::InvalidPayer => String::from_str(_env, "Invalid payer address"),
            ContractError::InvalidMerchant => String::from_str(_env, "Invalid merchant address"),
            ContractError::InvalidAmount => String::from_str(_env, "Invalid amount"),
            ContractError::InvalidAsset => String::from_str(_env, "Invalid asset"),
            ContractError::InvalidMilestoneCount => String::from_str(_env, "Invalid milestone count (must be >= 1 and <= 10)"),
            ContractError::InvalidMilestonePercentage => String::from_str(_env, "Invalid milestone percentage"),
            ContractError::InvoiceAlreadyExists => String::from_str(_env, "Invoice already exists"),
            ContractError::InvoiceNotFound => String::from_str(_env, "Invoice not found"),
            ContractError::InvoiceNotPaid => String::from_str(_env, "Invoice not paid"),
            ContractError::InvoiceAlreadyCompleted => String::from_str(_env, "Invoice already completed"),
            ContractError::InvoiceCancelled => String::from_str(_env, "Invoice cancelled"),
            ContractError::MilestoneNotFound => String::from_str(_env, "Milestone not found"),
            ContractError::MilestoneAlreadyCompleted => String::from_str(_env, "Milestone already completed"),
            ContractError::MilestoneNotApproved => String::from_str(_env, "Milestone not approved"),
            ContractError::InsufficientBalance => String::from_str(_env, "Insufficient balance"),
            ContractError::TransferFailed => String::from_str(_env, "Transfer failed"),
            ContractError::MilestoneTotalExceeds100 => String::from_str(_env, "Total milestone percentages exceed 100"),
            ContractError::InvoiceAlreadyPaid => String::from_str(_env, "Invoice already paid"),
        }
    }
}

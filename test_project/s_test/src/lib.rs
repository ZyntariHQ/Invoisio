use soroban_sdk::{Env, Symbol, contract, contractimpl, contracttype, symbol_short};

#[contracttype]
pub enum DataKey {
    Key
}

#[contract]
pub struct TestContract;
#[contractimpl]
impl TestContract {
    pub fn test(env: Env) -> bool {
        env.storage().persistent().set(&DataKey::Key, &1u32);
        env.storage().persistent().extend_ttl(&DataKey::Key, 10, 10);
        true
    }
    
    pub fn check(env: Env) -> (bool, bool) {
        let has = env.storage().persistent().has(&DataKey::Key);
        let get: Option<u32> = env.storage().persistent().get(&DataKey::Key);
        (has, get.is_some())
    }
}

#[test]
fn test_archival() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(TestContract, ());
    let client = TestContractClient::new(&env, &id);
    
    client.test();
    
    env.ledger().with_mut(|l| l.sequence_number += 20);
    
    let res = client.check();
    std::println!("HAS: {}, GET: {}", res.0, res.1);
    panic!("FORCE FAIL TO SEE OUTPUT");
}

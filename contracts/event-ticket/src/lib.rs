#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, String, Symbol};

#[contract]
pub struct EventTicketPass;

#[contractimpl]
impl EventTicketPass {
    pub fn event_name(env: Env) -> String {
        String::from_str(&env, "Stellar Builder Meetup")
    }

    pub fn ticket_price(env: Env) -> String {
        String::from_str(&env, "1 XLM Testnet")
    }

    pub fn claim_ticket(env: Env, user: Address) -> bool {
        user.require_auth();

        let key: (Symbol, Address) = (symbol_short!("ticket"), user.clone());

        if env.storage().persistent().has(&key) {
            return false;
        }

        env.storage().persistent().set(&key, &true);

        let total_key = symbol_short!("total");
        let current_total: u32 = env
            .storage()
            .persistent()
            .get(&total_key)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&total_key, &(current_total + 1));

        env.events().publish(
            (
                symbol_short!("ticket"),
                symbol_short!("claim"),
                user.clone(),
            ),
            true,
        );

        true
    }

    pub fn has_ticket(env: Env, user: Address) -> bool {
        let key: (Symbol, Address) = (symbol_short!("ticket"), user);
        env.storage().persistent().get(&key).unwrap_or(false)
    }

    pub fn total_tickets(env: Env) -> u32 {
        let total_key = symbol_short!("total");
        env.storage().persistent().get(&total_key).unwrap_or(0)
    }
}


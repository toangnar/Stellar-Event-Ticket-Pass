# Stellar Event Ticket Pass

Stellar Event Ticket Pass is a beginner-friendly Stellar Testnet project that demonstrates how an event ticket can be claimed and verified through a Soroban smart contract.

The project allows a user to claim an on-chain event ticket pass using a Stellar testnet account. After claiming, the contract can verify whether the wallet already owns a ticket and track the total number of claimed tickets.

---

## Project Overview

This project was built as part of the Stellar learning journey.

The main idea is simple:

> A user can claim an event ticket pass on Stellar Testnet, and the smart contract stores proof that the wallet has already claimed a ticket.

Instead of relying only on manual guest lists, screenshots, or off-chain confirmation, the event ticket status can be checked directly from the deployed Soroban smart contract.

---

## Project Vision

The vision of Stellar Event Ticket Pass is to explore how Stellar smart contracts can be used for simple and transparent event access management.

In this early version, the project focuses on the basic ticket claim and verification flow:

- Claim an event ticket
- Store ticket ownership on-chain
- Verify if a wallet has already claimed a ticket
- Track the total number of claimed tickets

In future versions, this concept could be expanded into a complete event ticketing dApp with QR-code check-in, paid ticket purchases, multiple events, and organizer dashboards.

---

## Features

- Deploy a Soroban smart contract on Stellar Testnet
- Claim an event ticket pass with a Stellar testnet account
- Prevent the same wallet from claiming more than once
- Check whether a wallet already has a ticket
- Track total claimed tickets
- Read event information from the contract
- View transaction result on Stellar Expert

---

## Screenshots

### Deployed Contract on Stellar Testnet

<img width="651" height="418" alt="image" src="https://github.com/user-attachments/assets/14da67b3-5e91-4ffd-b434-5861ea2f40f7" />

---

### Event Name Result

<img width="1280" height="84" alt="image" src="https://github.com/user-attachments/assets/038c7212-119f-4632-b3f8-aaaf74290323" />

---

### Claim Ticket Success

<img width="1280" height="186" alt="image" src="https://github.com/user-attachments/assets/f2ba3747-be53-4091-9539-187eb171cb80" />

---

### Has Ticket Result

<img width="1280" height="78" alt="image" src="https://github.com/user-attachments/assets/a84015e1-c31d-40ed-a081-0ed125b941ba" />

---

### Total Tickets Result

<img width="1280" height="79" alt="image" src="https://github.com/user-attachments/assets/f82cda0e-c936-4bc9-9402-19a1a40ec426" />

---

### Wallet Balance

<img width="644" height="564" alt="image" src="https://github.com/user-attachments/assets/1efb21da-24df-4df7-9b89-4f594a92cfca" />

---

## Smart Contract Functions

### `event_name()`

Returns the name of the event.

Expected result:

```text
"Stellar Builder Meetup"

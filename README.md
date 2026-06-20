# DShield

> **Private by Default. Compliant by Choice.**

DShield is a consumer-grade shielded stablecoin wallet built on Stellar that enables private USDC payments using Zero-Knowledge Proofs (ZKPs).

Users can send and receive funds without publicly exposing transaction amounts, balances, or payment history while retaining the ability to selectively disclose information when required for compliance, auditing, or regulatory reporting.

Built for **Stellar Hacks: Real-World ZK**, DShield demonstrates how privacy and compliance can coexist in modern financial systems.

---

## Vision

Today's digital payments force users to choose between:

* Complete transparency (traditional blockchains)
* Complete anonymity (privacy-focused networks)

Neither option works for real-world finance.

DShield introduces a third model:

> Prove what's true. Reveal nothing else.

Using Zero-Knowledge Proofs, users can prove ownership, authorization, compliance, and transaction validity without exposing sensitive financial information.

---

## Problem

Public blockchains expose:

* Wallet balances
* Transaction history
* Payment amounts
* Financial relationships

Anyone can analyze a user's entire financial activity.

For stablecoins intended for everyday payments, payroll, remittances, and commerce, this level of transparency creates serious privacy concerns.

At the same time, regulators and institutions require mechanisms for compliance and accountability.

Current privacy solutions often sacrifice one for the other.

---

## Solution

DShield combines:

* Shielded transactions
* Zero-Knowledge Proofs
* Selective disclosure
* Compliance-aware architecture

to create a private payments experience that feels like traditional banking while maintaining blockchain security and verifiability.

Users can:

✅ Send private USDC payments

✅ Hide transaction amounts

✅ Hide wallet balances

✅ Prevent transaction graph analysis

✅ Prove compliance without exposing personal data

✅ Reveal information only when necessary

---

## How It Works

### 1. Deposit

Users deposit USDC into a shielded pool.

The deposit creates a cryptographic commitment that represents ownership of funds without revealing balances publicly.

---

### 2. Private Transfer

When sending funds:

* A Zero-Knowledge Proof is generated client-side
* The proof demonstrates:

  * Ownership of funds
  * Valid transaction construction
  * No double-spending
  * Balance preservation

without revealing:

* Sender
* Receiver
* Amount

---

### 3. On-Chain Verification

A Soroban smart contract verifies the proof using Stellar's native ZK primitives.

Only the proof validity is revealed.

No private transaction data becomes public.

---

### 4. Selective Disclosure

Users can generate specialized proofs for:

#### Compliance Proof

Prove:

* KYC completed
* Wallet authorized
* Jurisdiction approved

without revealing identity information.

#### Audit Proof

Prove:

* Source of funds
* Transaction legitimacy
* Ownership of assets

without exposing unrelated transactions.

#### Regulatory Reporting

Reveal only the specific information required by regulators while preserving overall financial privacy.

---

## Why Stellar

Stellar has recently introduced native support for modern ZK verification through Protocol 25 and Protocol 26.

These upgrades provide:

* BN254 elliptic curve operations
* Pairing checks
* Poseidon hashing
* Multi-scalar multiplication
* Efficient zkSNARK verification

This allows DShield to verify proofs on-chain efficiently and affordably.

---

## Architecture

```text
+-----------------------+
|      DShield App      |
+-----------------------+
            |
            v
+-----------------------+
| Client-side Prover    |
| (Noir / zkSNARKs)     |
+-----------------------+
            |
            v
+-----------------------+
| Shielded Pool         |
| Commitments           |
| Nullifiers            |
+-----------------------+
            |
            v
+-----------------------+
| Soroban Verifier      |
| BN254 Verification    |
+-----------------------+
            |
            v
+-----------------------+
| Stellar Network       |
+-----------------------+
```

## Tech Stack

### Blockchain

* Stellar
* Soroban

### Zero-Knowledge

* Noir
* UltraHonk
* zkSNARKs
* BN254

### Cryptography

* Poseidon Hash
* Poseidon2 Hash
* Merkle Trees

### Frontend

* Next.js
* TypeScript
* TailwindCSS

### Wallet Integration

* Freighter Wallet

### Storage

* Encrypted local notes
* Optional decentralized backup

---

## Core Features

### Private Payments

Send stablecoins privately.

### Shielded Balances

Wallet balances remain hidden.

### Client-Side Proof Generation

Sensitive data never leaves the user's device.

### Compliance Proofs

Generate proofs without revealing personal information.

### Selective Disclosure

Reveal only what is necessary.

### Consumer-Grade UX

Designed for ordinary users, not cryptography experts.

---

## Future Roadmap

### Phase 1

* Shielded deposits
* Shielded transfers
* Proof verification

### Phase 2

* Compliance credentials
* Selective disclosure
* Auditor access proofs

### Phase 3

* Private payroll
* Private merchant payments
* Confidential business treasury management

### Phase 4

* Cross-border remittances
* Confidential RWA settlements
* Institutional privacy infrastructure

---

## Example Use Cases

### Payroll

Employees receive salaries without exposing compensation publicly.

### Business Payments

Companies protect supplier relationships and payment amounts.

### Remittances

Families receive funds privately.

### Personal Finance

Users maintain financial confidentiality while using stablecoins.

### Institutional Settlement

Organizations can transact confidentially while remaining compliant.

---

## Competitive Advantage

| Feature              | Traditional Blockchain | Privacy Coins | DShield |
| -------------------- | ---------------------- | ------------- | ------- |
| Private Payments     | ❌                      | ✅             | ✅       |
| Compliance Friendly  | ✅                      | ❌             | ✅       |
| Selective Disclosure | ❌                      | ❌             | ✅       |
| Stablecoin Focus     | ✅                      | ❌             | ✅       |
| Consumer UX          | ⚠️                     | ⚠️            | ✅       |

---

## Hackathon Track

**Stellar Hacks: Real-World ZK**

DShield showcases how Zero-Knowledge technology can unlock practical privacy for stablecoin payments without sacrificing compliance, usability, or trust.

---

## Team

Built with the belief that privacy should be a default right, not a premium feature.

---

## License

MIT License

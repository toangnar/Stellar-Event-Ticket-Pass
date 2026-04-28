import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";

type TxStatus = "idle" | "pending" | "success" | "failed";

type TicketInfo = {
  eventName: string;
  price: string;
  holder: string;
  network: string;
  contractId: string;
  status: string;
  txHash?: string;
};

const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID;
const RPC_URL =
  import.meta.env.VITE_STELLAR_RPC_URL ||
  "https://soroban-testnet.stellar.org";

function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function getTicketTxStorageKey(address: string) {
  return `event-ticket-tx:${CONTRACT_ID}:${address}`;
}

function saveTicketTxHash(address: string, hash: string) {
  if (!address || !hash) return;
  localStorage.setItem(getTicketTxStorageKey(address), hash);
}

function loadTicketTxHash(address: string) {
  if (!address) return "";
  return localStorage.getItem(getTicketTxStorageKey(address)) || "";
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function getFriendlyError(error: unknown) {
  console.error("Raw error:", error);

  const message = stringifyError(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("not connected") ||
    lower.includes("not found") ||
    lower.includes("wallet")
  ) {
    return `Wallet error: ${message}`;
  }

  if (
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("cancel")
  ) {
    return `Transaction rejected by user: ${message}`;
  }

  if (lower.includes("insufficient") || lower.includes("balance")) {
    return `Insufficient balance: ${message}`;
  }

  return `Contract call failed: ${message}`;
}

export default function App() {
  const [publicKey, setPublicKey] = useState("");
  const [walletName, setWalletName] = useState("Not connected");
  const [ticketStatus, setTicketStatus] = useState("Not checked");
  const [_totalTickets, setTotalTickets] = useState("Not loaded");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState("");
  const [ticketInfo, setTicketInfo] = useState<TicketInfo | null>(null);
  const [error, setError] = useState("");
  const [recoveredTxHash, setRecoveredTxHash] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const server = useMemo(() => new rpc.Server(RPC_URL), []);
  const contract = useMemo(() => new Contract(CONTRACT_ID), []);

  useEffect(() => {
    try {
      const kitAny = StellarWalletsKit as any;

      kitAny.init({
        modules: defaultModules(),
      });
    } catch (err) {
      setError(getFriendlyError(err));
    }
  }, []);

  async function readContractWithAddress(address: string, method: string, args: any[] = []) {
    const source = await server.getAccount(address);

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if ("error" in sim) {
      throw new Error(sim.error);
    }

    return scValToNative(sim.result!.retval);
  }

  async function findRecentTicketClaimTx(address: string) {
    const savedTxHash = loadTicketTxHash(address);

    if (savedTxHash) {
      return savedTxHash;
    }
    try {
      const latestLedger = await server.getLatestLedger();
      const startLedger = Math.max(1, latestLedger.sequence - 50000);

      const response = await server.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
          },
        ],
        limit: 100,
      });

      const events = response.events || [];

      console.log("Recovered events:", events);

      const matched = events
        .slice()
        .reverse()
        .find((event: any) => {
          try {
            const decodedTopics = (event.topic || event.topics || []).map((topic: any) => {
              try {
                return String(scValToNative(topic));
              } catch {
                return JSON.stringify(topic);
              }
            });

            const decodedValue = (() => {
              try {
                return String(scValToNative(event.value));
              } catch {
                return JSON.stringify(event.value || event.data || {});
              }
            })();

            console.log("Decoded event:", {
              txHash: event.txHash,
              transactionHash: event.transactionHash,
              id: event.id,
              decodedTopics,
              decodedValue,
            });

            return (
              decodedTopics.includes("ticket") &&
              decodedTopics.includes("claim") &&
              decodedTopics.some((topic: string) => topic.includes(address))
            );
          } catch {
            return false;
          }
        });

      const eventAny = matched as any;

      return (
        eventAny?.txHash ||
        eventAny?.transactionHash ||
        eventAny?.id ||
        ""
      );
    } catch (err) {
      console.warn("Could not recover ticket claim transaction hash:", err);
      return "";
    }
  }

  async function loadTicketForAddress(address: string) {
    const hasTicket = await readContractWithAddress(address, "has_ticket", [
      new Address(address).toScVal(),
    ]);

    const total = await readContractWithAddress(address, "total_tickets");

    setTotalTickets(String(total));

    if (hasTicket) {
      setTicketStatus("Ticket claimed");
      setTicketInfo(null);

      setRecoveredTxHash("");
    } else {
      setTicketStatus("No ticket found");
      setTicketInfo(null);
    }
  }

  

  async function connectWallet() {
    try {
      setError("");
      setIsConnecting(true);

      const kitAny = StellarWalletsKit as any;

      // Clear old cached wallet session first.
      try {
        if (typeof kitAny.disconnect === "function") {
          await kitAny.disconnect();
        }
      } catch {
        // Ignore disconnect errors.
      }

      // Clear UI before opening wallet modal.
      setPublicKey("");
      setWalletName("Not connected");
      setTicketStatus("Not checked");
      setTicketInfo(null);
      setTxStatus("idle");
      setTxHash("");
    setRecoveredTxHash("");

      if (typeof kitAny.authModal !== "function") {
        throw new Error("Wallets Kit authModal is not available.");
      }

      // Open wallet selection modal.
      kitAny.authModal();

      // Wait for the user to actually select/approve a wallet.
      for (let i = 0; i < 30; i++) {
        try {
          const response = await kitAny.getAddress();

          if (response?.address) {
            const address = response.address;

            setPublicKey(address);
            setWalletName("Connected Stellar Wallet");
            setIsConnecting(false);

            await loadTicketForAddress(address);
            return;
          }
        } catch {
          // Keep waiting while user is selecting a wallet.
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      setIsConnecting(false);
      throw new Error("No wallet has been connected.");
    } catch (err) {
      setIsConnecting(false);
      setError(getFriendlyError(err));
    }
  }

  function disconnectWallet() {
    setPublicKey("");
    setWalletName("Not connected");
    setTicketStatus("Not checked");
    setTotalTickets("Not loaded");
    setTxStatus("idle");
    setTxHash("");
    setRecoveredTxHash("");
    setTicketInfo(null);
    setError("");
  }

  async function handleWalletButton() {
    if (publicKey) {
      disconnectWallet();
      return;
    }

    await connectWallet();
  }

  async function readContract(method: string, args: any[] = []) {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const source = await server.getAccount(publicKey);

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if ("error" in sim) {
      throw new Error(sim.error);
    }

    return scValToNative(sim.result!.retval);
  }

  async function loadTotalTickets() {
    try {
      setError("");
      const total = await readContract("total_tickets");
      setTotalTickets(String(total));
    } catch (err) {
      setError(getFriendlyError(err));
    }
  }

  async function checkTicket() {
    try {
      setError("");

      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      const result = await readContract("has_ticket", [
        new Address(publicKey).toScVal(),
      ]);

      if (result) {
        setTicketStatus("Ticket claimed");

        const oldTxHash = recoveredTxHash || (await findRecentTicketClaimTx(publicKey));
        if (oldTxHash) {
          setRecoveredTxHash(oldTxHash);
        } else {
          setRecoveredTxHash("");
        }

        setTicketInfo({
          eventName: "Stellar Builder Meetup",
          price: "1 XLM Testnet",
          holder: publicKey,
          network: "Stellar Testnet",
          contractId: CONTRACT_ID,
          status: "Valid Ticket",
          txHash: txHash || oldTxHash || "",
        });
      } else {
        setTicketStatus("No ticket found");
        setTicketInfo(null);
      }

      await loadTotalTickets();
    } catch (err) {
      setError(getFriendlyError(err));
    }
  }

  async function claimTicket() {
    try {
      setError("");
      setTxHash("");
    setRecoveredTxHash("");

      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      // First check ticket status with read-only simulation.
      // This prevents sending a paid transaction if the wallet already has a ticket.
      const alreadyClaimed = await readContract("has_ticket", [
        new Address(publicKey).toScVal(),
      ]);

      if (alreadyClaimed) {
        setTicketStatus("Ticket claimed");
        setTxStatus("idle");
        setError("");
        return;
      }

      setTxStatus("pending");

      const source = await server.getAccount(publicKey);

      const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call("claim_ticket", new Address(publicKey).toScVal())
        )
        .setTimeout(30)
        .build();

      const preparedTx = await server.prepareTransaction(tx);

      const signed = await (StellarWalletsKit as any).signTransaction(
        preparedTx.toXDR(),
        {
          networkPassphrase: Networks.TESTNET,
          address: publicKey,
        }
      );

      const signedXdr =
        typeof signed === "string" ? signed : (signed as any).signedTxXdr;

      const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);

      const sendResult = await server.sendTransaction(signedTx);

      setTxHash(sendResult.hash);
      setRecoveredTxHash(sendResult.hash);
      saveTicketTxHash(publicKey, sendResult.hash);

      for (let i = 0; i < 12; i++) {
        const result = await server.getTransaction(sendResult.hash);

        if (result.status === "SUCCESS") {
          setTxStatus("success");
          setTicketStatus("Ticket claimed");

          setTicketInfo({
            eventName: "Stellar Builder Meetup",
            price: "1 XLM Testnet",
            holder: publicKey,
            network: "Stellar Testnet",
            contractId: CONTRACT_ID,
            status: "Valid Ticket",
            txHash: sendResult.hash,
          });

          await loadTotalTickets();
          return;
        }

        if (result.status === "FAILED") {
          throw new Error("Transaction failed");
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setTxStatus("success");
    } catch (err) {
      setTxStatus("failed");
      setError(getFriendlyError(err));
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="badge">Stellar Testnet · Level 2</p>
        <h1>Stellar Event Ticket Pass</h1>
        <p>
          A multi-wallet Stellar dApp for claiming and verifying event ticket
          passes through a deployed Soroban smart contract.
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Multi-Wallet Connection</h2>
          <p className="muted">
            Click Connect Wallet to choose a Stellar wallet. After connection,
            this button becomes Disconnect.
          </p>

          <div className="actions">
            <button onClick={handleWalletButton} disabled={isConnecting}>
              {publicKey ? "Disconnect" : isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>

          <div className="info">
            <p>
              <span>Wallet:</span> {walletName}
            </p>
            <p>
              <span>Address:</span>{" "}
              {publicKey ? shortAddress(publicKey) : "Not connected"}
            </p>
          </div>
        </div>

        <div className="card">
          <h2>Event</h2>
          <p className="muted">On-chain event ticket verification.</p>

          <div className="info">
            <p>
              <span>Event:</span> Stellar Builder Meetup
            </p>
            <p>
              <span>Ticket Price:</span> 1 XLM Testnet
            </p>
            <p>
              <span>Network:</span> Testnet
            </p>
          </div>
        </div>

        <div className="card wide">
          <h2>Contract</h2>
          <p className="muted">
            Contract ID is automatically injected from frontend/.env after
            deployment.
          </p>

          <code>{CONTRACT_ID || "No contract ID found in .env"}</code>

          <div className="actions">
            <button
              onClick={claimTicket}
              disabled={!publicKey || ticketStatus === "Ticket claimed"}
              className={ticketStatus === "Ticket claimed" ? "claimed-button" : ""}
            >
              {ticketStatus === "Ticket claimed" ? "Ticket Claimed" : "Claim Ticket"}
            </button>
            <button
              className="secondary"
              onClick={checkTicket}
              disabled={!publicKey}
            >
              Check Ticket
            </button>
            
          </div>
        </div>

        <div className="card">
          <h2>Ticket Status</h2>

          <div className="status-box">
            <p>{ticketStatus}</p>
          </div>

          {ticketInfo ? (
            <div className="ticket-details merged">
              <p><span>Event:</span> {ticketInfo.eventName}</p>
              <p><span>Price:</span> {ticketInfo.price}</p>
              <p><span>Status:</span> {ticketInfo.status}</p>
              <p><span>Network:</span> {ticketInfo.network}</p>
              <p><span>Holder:</span> {shortAddress(ticketInfo.holder)}</p>
              <p><span>Contract:</span> {shortAddress(ticketInfo.contractId)}</p>
              
            </div>
          ) : (
            <p className="muted ticket-empty">
              Ticket information is hidden. Click Check Ticket to view ticket details.
            </p>
          )}

          
        </div>

        <div className="card">
          <h2>Transaction Status</h2>
          <div className={`status ${txStatus}`}>{txStatus}</div>

          {(txHash || recoveredTxHash) && (
            <p className="tx-hash-text">
              <span>Tx Hash:</span> {shortAddress(txHash || recoveredTxHash)}
            </p>
          )}

          {(txHash || recoveredTxHash) && (
            <a
              className="tx-link"
              href={`https://stellar.expert/explorer/testnet/tx/${txHash || recoveredTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction on Stellar Expert
            </a>
          )}
        </div>
      </section>

      {error && (
        <section className="error">
          <strong>Error handled:</strong> {error}
        </section>
      )}

      <section className="requirements">
        <h2>Level 2 Requirements Covered</h2>
        <ul>
          <li>Stellar Wallets Kit implementation</li>
          <li>Wallet options available after clicking Connect Wallet</li>
          <li>Contract deployed on Stellar Testnet</li>
          <li>Contract ID auto-injected into frontend/.env</li>
          <li>Contract called from frontend</li>
          <li>Reading and writing data to the contract</li>
          <li>Transaction status tracking: idle / pending / success / failed</li>
          <li>
            3 error types handled: wallet not found, user rejected transaction,
            insufficient balance / contract call failed
          </li>
        </ul>
      </section>
    </main>
  );
}
























"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { getNetworkPassphrase, getDevKeypair, devSignTransaction } from "@/lib/stellar";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { HanaModule } from "@creit.tech/stellar-wallets-kit/modules/hana";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";

interface WalletContextType {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  isConnecting: boolean;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  connect: async () => {},
  disconnect: () => {},
  signTransaction: async () => "",
  isConnecting: false,
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false);
  const [address, setAddress] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const devKeypair = getDevKeypair();
    if (devKeypair) {
      const addr = devKeypair.publicKey();
      localStorage.setItem("dshield_wallet", addr);
      return addr;
    }
    const saved = localStorage.getItem("dshield_wallet");
    return saved || null;
  });
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    StellarWalletsKit.init({
      network: Networks.STANDALONE,
      selectedWalletId: "freighter",
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new LobstrModule(),
        new HanaModule(),
        new AlbedoModule(),
      ],
    });
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const devKeypair = getDevKeypair();
      if (devKeypair) {
        const addr = devKeypair.publicKey();
        setAddress(addr);
        localStorage.setItem("dshield_wallet", addr);
      } else {
        const { address: addr } = await StellarWalletsKit.authModal();
        setAddress(addr);
        localStorage.setItem("dshield_wallet", addr);
      }
    } catch {
      // user closed modal
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // ignore
    }
    setAddress(null);
    localStorage.removeItem("dshield_wallet");
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (getDevKeypair()) {
        return devSignTransaction(xdr);
      }
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: getNetworkPassphrase(),
      });
      return signedTxXdr;
    },
    [],
  );

  return (
    <WalletContext.Provider
      value={{ address, connect, disconnect, signTransaction, isConnecting }}
    >
      {children}
    </WalletContext.Provider>
  );
}

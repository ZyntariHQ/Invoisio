require('dotenv').config();
require('@nomicfoundation/hardhat-toolbox');

const { RPC_URL, RPC_URL_MAINNET, EVM_RPC_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: "0.8.20",
  networks: {
    baseSepolia: {
      url: RPC_URL || EVM_RPC_URL || "https://sepolia.base.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    base: {
      url: RPC_URL_MAINNET || "https://mainnet.base.org",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
import type { HardhatUserConfig } from "hardhat/config";

import * as dotenv from "dotenv";
dotenv.config();


import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ethers"; 
import { configVariable } from "hardhat/config";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL!,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY!],
    },
  },
};

export default config;















// import { HardhatUserConfig } from "hardhat/config";
// import "@nomicfoundation/hardhat-toolbox";
// import "@nomicfoundation/hardhat-toolbox-viem";
// import * as dotenv from "dotenv";
// dotenv.config();

// const config: HardhatUserConfig = {
//   solidity: {
//     profiles: {
//       default: { version: "0.8.28" },
//       production: {
//         version: "0.8.28",
//         settings: {
//           optimizer: { enabled: true, runs: 200 },
//         },
//       },
//     },
//   },
//   networks: {
//     sepolia: {
//       type: "http",
//       chainType: "l1",
//       url: process.env.SEPOLIA_RPC_URL || "",
//       accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
//     },
//   },
// };

// export default config;

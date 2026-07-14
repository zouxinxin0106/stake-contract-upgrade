# Hardhat v2 → v3 升级方案

## 背景

当前项目使用 Hardhat v2（`^2.22.8`），需升级至 Hardhat v3（当前稳定版 v3.9.1）。

# 遇到的问题

1. 这个项目的所有脚本和测试文件目前都是 CommonJS（require/module.exports）。Hardhat v3 要求配置文件必须是 ESM（import/export），但脚本和测试文件可以保留为 CommonJS（改成 .cjs 扩展名）
解决方案：配置改 ESM，脚本继续 CommonJS，只是把脚本文件名改成 .cjs 结尾。优点：改动最小，适用于庞大的生产项目

2. 配置文件推荐用 TypeScript（.ts），但也可以纯 JS（.mjs）。项目目前全是用 JS
解决方案：全部改成 .ts，hardhat v3 官方推荐，有类型提示和自动补全，更符合生产项目要求

---

## 步骤 1：创建备份分支

```bash
git checkout -b migrate-hardhat-v3
```

---

## 步骤 2：修改 package.json 依赖

编辑 `package.json`，**删除**以下包（14 个）：

```diff
- "hardhat": "^2.22.8"
- "@nomicfoundation/hardhat-toolbox": "^5.0.0"
- "@nomicfoundation/hardhat-chai-matchers": "^2.0.0"
- "@nomicfoundation/hardhat-ethers": "^3.0.0"
- "@nomicfoundation/hardhat-ignition": "^0.15.0"
- "@nomicfoundation/hardhat-ignition-ethers": "^0.15.0"
- "@nomicfoundation/hardhat-network-helpers": "^1.0.0"
- "@nomicfoundation/hardhat-verify": "^2.0.0"
- "@typechain/ethers-v6": "^0.5.0"
- "@typechain/hardhat": "^9.0.0"
- "typechain": "^8.3.0"
- "hardhat-gas-reporter": "^1.0.8"
- "solidity-coverage": "^0.8.0"
- "hardhat-deploy": "^0.14.0"
- "dotenv": "^16.4.5"
```

> `dotenv` 可以保留如果后续选择用 `process.env` 方案而不是 Hardhat keystore。

**新增**以下包：

```json
{
  "devDependencies": {
    "hardhat": "^3.9.0",
    "@nomicfoundation/hardhat-toolbox-mocha-ethers": "^1.0.0",
    "@openzeppelin/hardhat-upgrades": "^4.0.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "ethers": "^6.4.0",
    "chai": "^4.2.0",
    "@openzeppelin/contracts": "^5.0.2",
    "@openzeppelin/contracts-upgradeable": "^5.0.2"
  }
}
```

> 注意：`@openzeppelin/contracts` 和 `@openzeppelin/contracts-upgradeable` 原来是 `dependencies`，可以移到 `devDependencies` 中。

---

## 步骤 3：创建 tsconfig.json

在项目根目录新建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["hardhat.config.ts"],
  "exclude": ["node_modules"]
}
```

---

## 步骤 4：重写配置文件 hardhat.config.ts

**删除** `hardhat.config.js`，新建 `hardhat.config.ts`：

```typescript
import { configVariable, defineConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@openzeppelin/hardhat-upgrades";

export default defineConfig({
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("ETHEREUM_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  etherscan: {
    apiKey: configVariable("ETHERSCAN_API_KEY"),
  },
});
```

> **如果不想用 keystore**，可以改成 `dotenv` 方案：
> ```typescript
> import "dotenv/config";
>
> // 在 defineConfig 里继续用 process.env.XXX
> url: process.env.ETHEREUM_RPC_URL,
> ```

---

## 步骤 5：更新 npm scripts

编辑 `package.json` 中的 `scripts`：

```json
{
  "scripts": {
    "build": "hardhat build",
    "test": "hardhat test",
    "clean": "hardhat clean",
    "deploy": "hardhat run scripts/deploy.cjs --network sepolia"
  }
}
```

CLI 变化说明：
- `npx hardhat compile` → `npx hardhat build`
- `npx hardhat test` 不变
- 脚本后缀改为 `.cjs`

---

## 步骤 6：设置 Hardhat keystore（二选一）

### 方案 A：使用 Hardhat keystore（推荐）

```bash
npx hardhat vars set ETHEREUM_RPC_URL
# 提示时粘贴你的 Infura URL，例如: https://sepolia.infura.io/v3/你的KEY

npx hardhat vars set PRIVATE_KEY
# 提示时粘贴你的钱包私钥

npx hardhat vars set ETHERSCAN_API_KEY
# 提示时粘贴你的 Etherscan API Key

# 验证
npx hardhat vars list
```

### 方案 B：继续使用 .env + dotenv

不改 `hardhat.config.ts`，按步骤 4 的备选方案写，保留 `.env` 文件。

---

## 步骤 7：更新脚本文件（7 个）

每个脚本从 `scripts/xxx.js` 改名 `scripts/xxx.cjs`，同时修改连接模式。

### 核心变化模式

**修改前（v2）：**
```js
const { ethers, upgrades } = require("hardhat");
// 直接在顶层用 ethers
```

**修改后（v3）：**
```js
const hre = require("hardhat");
// 不再从 hardhat 解构 ethers

async function main() {
  const connection = await hre.network.create();  // 获取网络连接
  const { ethers } = connection;                   // 从连接中获取 ethers
  // ... 剩余代码不变
}
```

### 7a. scripts/deploy.js → scripts/deploy.cjs

同时还需要修改 `upgrades` 和 `verify` 的用法：

```diff
- const { ethers, upgrades } = require("hardhat");
+ const hre = require("hardhat");
+ const { upgrades } = require("@openzeppelin/hardhat-upgrades");

  async function main() {
+   const connection = await hre.network.create();
+   const { ethers } = connection;
+   const upgradesApi = await upgrades(hre, connection);

    const [signer] = await ethers.getSigners();
    const MetaNodeToken = await ethers.getContractFactory("MetaNodeToken");
    const metaNodeToken = await MetaNodeToken.deploy();
    await metaNodeToken.waitForDeployment();
    const metaNodeTokenAddress = await metaNodeToken.getAddress();

    const MetaNodeStake = await ethers.getContractFactory("MetaNodeStake");
    const startBlock = 1;
    const endBlock = 999999999999;
    const metaNodePerBlock = ethers.parseUnits("1", 18);

-   const stake = await upgrades.deployProxy(
+   const stake = await upgradesApi.deployProxy(
      MetaNodeStake,
      [metaNodeTokenAddress, startBlock, endBlock, metaNodePerBlock],
      { initializer: "initialize", kind: "uups" }
    );
    await stake.waitForDeployment();
    const stakeAddress = await stake.getAddress();

-   const implAddress = await upgrades.erc1967.getImplementationAddress(stakeAddress);
+   const implAddress = await upgradesApi.erc1967.getImplementationAddress(stakeAddress);

    // verify 部分
-   await hre.run("verify:verify", { address: implAddress, constructorArguments: [] });
+   await hre.run("verify", { address: implAddress, constructorArguments: [] });
```

### 7b. scripts/MetaNodeStake.js → scripts/MetaNodeStake.cjs

```diff
- const { ethers, upgrades } = require("hardhat");
+ const hre = require("hardhat");
+ const { upgrades } = require("@openzeppelin/hardhat-upgrades");

  async function main() {
+   const connection = await hre.network.create();
+   const { ethers } = connection;
+   const upgradesApi = await upgrades(hre, connection);

    const MetaNodeToken = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const startBlock = 6529999;
    const endBlock = 9529999;
    const MetaNodePerBlock = "20000000000000000";

    const Stake = await ethers.getContractFactory("MetaNodeStake");
    console.log("Deploying MetaNodeStake...");
-   const s = await upgrades.deployProxy(Stake, [...], { initializer: "initialize" });
+   const s = await upgradesApi.deployProxy(Stake, [...], { initializer: "initialize" });
```

### 7c-7g：其余 5 个脚本

`addPool.js`、`addERC20Pool.js`、`checkNonce.js`、`cancelTransaction.js`、`tokenInteract.js`

修改模式相同（这些脚本只用到了 `ethers`）：

```diff
- const { ethers } = require("hardhat");
+ const hre = require("hardhat");

  async function main() {
+   const connection = await hre.network.create();
+   const { ethers } = connection;
    // 接下来的代码保持不变
  }
```

> 注意 `tokenInteract.js` 有一个现有 bug：`ethers.getContractAt` 前面缺少 `await`，迁移时一并修复。

---

## 步骤 8：更新测试文件

`test/01_MetaNodeStakeTest.js` → `test/01_MetaNodeStakeTest.cjs`

```diff
- const { ethers, deployments, upgrades, parseEther } = require("hardhat")
- const { expect } = require("chai")
+ const hre = require("hardhat");
+ const { upgrades } = require("@openzeppelin/hardhat-upgrades");
+ const { expect } = require("chai");

  describe("stake test", function () {
+   let connection, ethers, upgradesApi;

+   before(async function () {
+     connection = await hre.network.create();
+     ethers = connection.ethers;
+     upgradesApi = await upgrades(hre, connection);
+   });

    it("deploy", async function () {
-     [a0, admin, user1, user2, user3] = await ethers.getSigners()
+     [a0, admin, user1, user2, user3] = await ethers.getSigners();

      const erc20 = await ethers.getContractFactory("MetaNodeToken");
      erc20Contract = await erc20.connect(admin).deploy();
      // ...

-     stakeProxyContract = await upgrades.deployProxy(metaNodeStake.connect(admin), [...], { kind: "uups" })
+     stakeProxyContract = await upgradesApi.deployProxy(metaNodeStake.connect(admin), [...], { kind: "uups" })
    });

    // 其余测试代码基本不变
  });
```

---

## 步骤 9：更新 Ignition 模块

`ignition/modules/MetaNode.js` → `ignition/modules/MetaNode.cjs`

```diff
  const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
- const { ethers, upgrades } = require("hardhat");   // ← 这两行在 v3 中无效，且未使用，直接删除

  module.exports = buildModule("MetaNodeTokenModule", (m) => {
    const MetaNodeToken = m.contract("MetaNodeToken");
    return { MetaNodeToken };
  });
```

---

## 步骤 10：更新 .gitignore

编辑 `.gitignore`：

```diff
  node_modules
- .env

  # Hardhat files
  /cache
  /artifacts

- # TypeChain files
- /typechain
- /typechain-types

- # solidity-coverage files
- /coverage
- /coverage.json

  # Hardhat Ignition default folder for deployments against a local node
  ignition/deployments/chain-31337
```

> 如果保留 `dotenv` 方案，`.env` 这一行不要删。

---

## 步骤 11：清除旧文件和缓存

```bash
# 删除旧的 JS 配置文件
rm hardhat.config.js

# 删除编译缓存和旧 artifacts
rm -rf cache artifacts typechain-types coverage
```

---

## 步骤 12：安装依赖

```bash
# 先删除旧的 lockfile 确保全新安装
rm package-lock.json bun.lockb

# 安装
npm install
```

---

## 步骤 13：编译验证

```bash
# v3 的编译命令从 compile 变成了 build
npx hardhat build
```

预期输出：`Compiled 33 Solidity files successfully`

---

## 步骤 14：运行测试

```bash
npx hardhat test
```

预期输出：所有测试用例通过。

---

## 验证清单

- [ ] `npx hardhat build` 编译成功 ✅
- [ ] `npx hardhat test` 全部测试通过 ✅
- [ ] `npx hardhat run scripts/addPool.cjs` 本地运行正常 ✅

---

## 注意事项

1. **OpenZeppelin Upgrades v4 API**：`upgrades(hre, connection)` 返回升级 API 对象，这是 v4 最大变化
2. **`hre.run("verify")` 参数**：v3 的 verify 任务可能参数不同，安装后执行 `npx hardhat verify --help` 确认
3. **出现 Chai 匹配器警告**：如果测试报错 `.reverted` 等匹配器需要传 `ethers`，说明项目使用了需要传参的匹配器，按需修复
4. **`.env` 文件**：如果选择 keystore 方案，迁移成功后可以安全删除 `.env`

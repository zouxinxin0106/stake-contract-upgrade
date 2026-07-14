# Hardhat v2 → v3 升级方案

## 背景

当前项目使用 Hardhat v2（`^2.22.8`），需升级至 Hardhat v3（当前稳定版 v3.9.1）。

# 遇到的问题

1. ⚠️ **已修正：必须用 ESM（.mjs），不能用 CommonJS（.cjs）**。原计划认为脚本可以保留 CommonJS（改成 .cjs），实际发现：
   - Hardhat v3 是纯 ESM 包，含有 top-level await
   - CJS 中 `const hre = require("hardhat")` 报错 `ERR_REQUIRE_ASYNC_MODULE`
   - 即使脚本用 `.cjs`，`globalThis.hre` 也是 `undefined`
   - 唯一可行方案是全部改为 ESM（`.mjs`）+ `import hre from "hardhat"` + top-level await
解决方案：用 `.mjs` 扩展名 + `import` 语法（`package.json` 已有 `"type": "module"`）

2. 配置文件推荐用 TypeScript（.ts），但也可以纯 JS（.mjs）。项目目前全是用 JS
解决方案：全部改成 .ts，hardhat v3 官方推荐，有类型提示和自动补全，更符合生产项目要求

3. **必须先删除旧的 `hardhat.config.js` 才能执行 v3 命令**：如果保留旧的 Hardhat v2 的 `hardhat.config.js`（CommonJS 格式），即使 `package.json` 已经安装 v3，`npx hardhat vars set` 等命令会报错：
	`TypeError: Cannot read properties of undefined (reading 'fileExists')`
	因为 v3 二进制执行时读取到旧 v2 配置文件，格式不兼容导致崩溃。
	解决方案：执行 `npx hardhat vars set` 之前，确保已删除 `hardhat.config.js`（或改名），并创建新的 `hardhat.config.ts`/`.mjs`。

4. **`package.json` 必须添加 `"type": "module"`**：Hardhat v3 强制要求项目为 ESM 模式。如果不加，执行任何 v3 命令都会报：
	`Hardhat only supports ESM projects. Please make sure you have "type": "module" in your package.json.`
	解决方案：在 `package.json` 中添加 `"type": "module"`，然后将所有仍在使用 `require/module.exports` 的脚本/测试/ignition 模块改为 `.mjs`（ESM 格式）。

5. **Windows PowerShell 的 `rm -rf` 不兼容**：文档中的 `rm -rf`、`rm file1 file2` 命令在 Windows PowerShell 中语法不同：
	- `rm -rf node_modules` → 应使用 `Remove-Item -Recurse -Force node_modules`
	- `rm package-lock.json bun.lockb` → 应使用 `Remove-Item package-lock.json, bun.lockb`
	- 更简单的方案：使用 `npx rimraf node_modules package-lock.json bun.lockb`

6. **Windows 上删除 `node_modules` 可能因文件锁定失败**：即使使用 `Remove-Item -Recurse -Force`，`@nomicfoundation/solidity-analyzer-win32-x64-msvc` 等原生模块因路径嵌套过深或编辑器占用文件句柄而报错：
	`无法删除项 ...\solidity-analyzer.win32-x64-msvc\solidity-analyzer.win32-x64-msvc.node`
	解决方案：先关闭 VS Code、Node 进程等所有可能占用 `node_modules` 中文件的程序，再执行删除。或使用 `npx rimraf node_modules`（rimraf 会重试失败的文件）。

7. **`hardhat-toolbox-mocha-ethers` 版本选择**：`@nomicfoundation/hardhat-toolbox-mocha-ethers` 需用 `^3.0.7`（而非 `^1.0.0`，后者不存在）。如果指定不存在的版本，`npm install` 会报：
	`npm error code ETARGET`
	`npm error No matching version found for @nomicfoundation/hardhat-toolbox-mocha-ethers@^1.0.0`

8. **npm ERESOLVE 依赖链冲突**：升级后 `npm install` 可能出现依赖树无法解析的问题，常见原因是 `chai` 版本冲突（hardhat-toolbox 可能依赖特定版本的 chai，而项目中声明了不同版本）。
	解决方案：
	- 先用 `npm install --legacy-peer-deps` 尝试安装
	- 或删除 `node_modules` 和 `package-lock.json` 后，只安装 `hardhat` 和 `hardhat-toolbox-mocha-ethers`，等依赖解析稳定后再安装其他包
	- 如果报 chai 类型定义相关的问题，检查 `chai` 是否使用了 v5（`^5.3.3`），需降级到 v4 或检查 hardhat-toolbox 的兼容性

9. **`hardhat.config.ts` 的 `plugins` 数组**：所有插件都必须用 default import 并放入 `plugins` 数组：
	- `@nomicfoundation/hardhat-toolbox-mocha-ethers`：import 后放入 plugins 数组
	- `@openzeppelin/hardhat-upgrades`：也**必须** import 后放入 plugins 数组（side-effect import 不会注册其 hooks，导致 `validations.json` 不生成，`upgrades.deployProxy` 报错 `Validations cache not found`）
	- 正确模板：
	  ```typescript
	  import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
	  import openzeppelinUpgrades from "@openzeppelin/hardhat-upgrades";
	  
	  export default defineConfig({
	    plugins: [hardhatToolboxMochaEthers, openzeppelinUpgrades],
	  });
	  ```

10. **`tsconfig.json` 的 `moduleResolution` 配置建议**：
	- 如果使用 `"moduleResolution": "node16"`，TypeScript 编译会严格检查 ESM 导入语法（要求文件扩展名等），可能出现 `import x from "./xxx"` 的错误
	- 建议改用 `"moduleResolution": "bundler"`，更宽松兼容，配合 Hardhat v3 使用更顺畅
	- `"module"` 选项建议用 `"esnext"` 而非 `"node20"`（Hardhat v3 自身也是 ESM 项目）

11. **v3 中 `verify` 配置的结构变化**：Hardhat v3 中 verify 的配置从顶层移到了 `verify.etherscan` 下：
	```typescript
	// Hardhat v2:
	etherscan: { apiKey: "..." },

	// Hardhat v3:
	verify: {
	  etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") },
	},
	```
	如果继续使用旧结构，`npx hardhat verify` 会忽略配置。

12. **迁移后脚本和测试文件必须全部改名（.js → .mjs）**：
	- 7 个脚本文件：`scripts/*.js` → `scripts/*.mjs`
	- 1 个测试文件：`test/*.js` → `test/*.mjs`
	- 1 个 Ignition 模块：`ignition/modules/*.js` → `ignition/modules/*.cjs`（该模块不 `require("hardhat")`，可用 CJS）
	- 同时需检查 `package.json` 中的 `scripts` 是否引用了正确的文件名（如 `scripts/deploy.mjs`）
	- 注意 `.cjs` 文件**不能**写 `require("hardhat")`，只能用 ESM `import`

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

（keystore 方案不需要 `dotenv`）

**新增**以下包：

```json
{
  "devDependencies": {
    "hardhat": "^3.9.0",
    "@nomicfoundation/hardhat-toolbox-mocha-ethers": "^3.0.7",
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
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import openzeppelinUpgrades from "@openzeppelin/hardhat-upgrades";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, openzeppelinUpgrades],
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
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
```

> ⚠️ **注意事项**：`plugins` 数组是必须的，否则会报警告；v3 中 verify 配置移到了 `verify.etherscan` 下（不再是顶层 `etherscan`）。详见"遇到的问题"第 9、11 条。


---

## 步骤 5：更新 npm scripts

编辑 `package.json` 中的 `scripts`：

```json
{
  "scripts": {
    "build": "hardhat build",
    "test": "hardhat test",
    "clean": "hardhat clean",
    "deploy": "hardhat run scripts/deploy.mjs --network sepolia"
  }
}
```

CLI 变化说明：
- `npx hardhat compile` → `npx hardhat build`
- `npx hardhat test` 不变
- 脚本后缀改为 `.mjs`（ESM 格式，因为 Hardhat v3 是纯 ESM 包，`require("hardhat")` 在 CJS 中不可用）

---

## 步骤 6：设置 Hardhat keystore

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

> 注意：设置后原来的 `.env` 文件不再需要，可以删除。

---

## 步骤 7：更新脚本文件（7 个）

每个脚本从 `scripts/xxx.js` 改名 `scripts/xxx.mjs`（ESM 格式），同时修改连接模式。

### 核心变化模式

**修改前（v2）：**
```js
const { ethers, upgrades } = require("hardhat");
// 直接在顶层用 ethers
```

**修改后（v3）：**
```mjs
import hre from "hardhat";
// 不再从 hardhat 解构 ethers
// （注：⚠️ 不能用 const hre = require("hardhat")，Hardhat v3 是纯 ESM）

const connection = await hre.network.create();  // 获取网络连接
const { ethers } = connection;                   // 从连接中获取 ethers
// ... 剩余代码不变（支持 top-level await，无需 main 函数包装）
```

### 7a. scripts/deploy.js → scripts/deploy.mjs

同时还需要修改 `upgrades` 和 `verify` 的用法：

```diff
- const { ethers, upgrades } = require("hardhat");
+ import hre from "hardhat";
+ import { upgrades } from "@openzeppelin/hardhat-upgrades";

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

### 7b. scripts/MetaNodeStake.js → scripts/MetaNodeStake.mjs

```diff
- const { ethers, upgrades } = require("hardhat");
+ import hre from "hardhat";
+ import { upgrades } from "@openzeppelin/hardhat-upgrades";

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
+ import hre from "hardhat";

- async function main() {
  // （ESM 支持 top-level await，无需 main 函数包装）
+ const connection = await hre.network.create();
+ const { ethers } = connection;
    // 接下来的代码保持不变
- }
```

> ⚠️ **重要区别**：`import` 方案使用 top-level await，不需要 `main().catch()` 包装。如果脚本中原本有 `main().then(...).catch(...)` 模式，直接去掉，把代码写在顶层即可。

> 注意 `tokenInteract.js` 有一个现有 bug：`ethers.getContractAt` 前面缺少 `await`，迁移时一并修复。

---

## 步骤 8：更新测试文件

`test/01_MetaNodeStakeTest.js` → `test/01_MetaNodeStakeTest.mjs`

```diff
- const { ethers, deployments, upgrades, parseEther } = require("hardhat")
- const { expect } = require("chai")
+ import hre from "hardhat";
+ import { upgrades } from "@openzeppelin/hardhat-upgrades";
+ import { expect } from "chai";

  describe("stake test", function () {
+   let ethers, upgradesApi, provider;

+   before(async function () {
+     const connection = await hre.network.create();
+     ethers = connection.ethers;
+     upgradesApi = await upgrades(hre, connection);
+     provider = ethers.provider;
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

> ⚠️ **关键细节**：必须在 `before` 中声明 `provider = ethers.provider`，避免测试代码中顶层引用 `ethers.provider` 时 `ethers` 还未初始化的时序问题。同时 `let` 声明需要包含所有变量（包括 `a0`），否则 ESM 严格模式下报 `ReferenceError`。
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

> 说明：使用 keystore 方案后 `.env` 不再需要，可在迁移完成后删除该文件。

---

## 步骤 11：清除旧文件

```bash
# 删除旧的 JS 配置文件
rm hardhat.config.js

# 删除 .env（已经迁移到 keystore，不再需要）
rm .env

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
4. **`.env` 文件**：keystore 设置完成后 `.env` 不再需要，步骤 11 中会删除 `.env`

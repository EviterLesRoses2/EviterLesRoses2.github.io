# 曾文博 — 个人学术主页

本项目基于 [PRISM](https://github.com/xyjoey/PRISM) 学术主页模板构建。

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

## 构建与部署

```bash
npm run build
```

静态文件会同步生成至 `out/` 与 `docs/`。推送到 `main` 分支后，GitHub Actions 会自动部署 GitHub Pages。

中英文内容分别位于 `content/` 与 `content_zh/`。

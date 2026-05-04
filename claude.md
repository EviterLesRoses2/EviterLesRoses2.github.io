# Publications Sorting Rules

When adding or reordering publications, follow these rules:

1. **Primary sort key**: Author position of Wenbo Zeng (ascending - 1st author first, then 2nd, 3rd, etc.)

2. **Secondary sort key** (for same author position): Journal Impact Factor (descending - higher IF first)

## Example Order
- 1st author papers (sorted by IF)
- 2nd author papers (sorted by IF)
- 3rd author papers (sorted by IF)
- ...

## Reference Impact Factors
- IEEE Transactions on Smart Grid: ~10.3
- IEEE Transactions on Power Electronics: ~6.0
- Power System Technology: ~6.5
- IEEE Transactions on Energy Conversion: ~5.0

---

# Deployment Workflow

## How It Works

This site uses GitHub Pages with an **artifact-based deployment** workflow:

1. **Build job**: Builds the site and uploads the `docs/` folder as an artifact
2. **Deploy job**: Deploys the artifact to GitHub Pages

The workflow is triggered automatically on every push to the `main` branch.

## When Adding New Content

Follow these steps to add new publications or update content:

### 1. Update Source Data
Edit `data/publications.js` to add/modify publications

### 2. Build Locally
```bash
npm run build
```
This generates updated files in the `docs/` folder

### 3. Commit Everything Together
```bash
git add data/publications.js docs/
git commit -m "Add: [publication title]"
git push
```

**Important**: Always commit both source files AND built files together. This ensures:
- The live site updates immediately after the workflow runs
- No mismatch between source and deployed content
- Clean deployment history

## What NOT to Do

❌ **Don't modify the workflow** unless you understand GitHub Pages deployment patterns
❌ **Don't commit built files separately** from source changes
❌ **Don't try to mix git commits with artifact deployment** - they're incompatible approaches

## Workflow File

The deployment workflow is at `.github/workflows/deploy.yml`. It uses:
- `actions/upload-pages-artifact@v3` - Creates artifact from docs/
- `actions/deploy-pages@v4` - Deploys the artifact

This is the standard GitHub-recommended pattern. Don't change it unless necessary.

# COR-Matrix Integration

The HAI Code Generator includes built-in integration with COR-Matrix, a Code Origin Ratio tracking system that helps you understand how much AI-generated code is retained over time.

## What is COR-Matrix?

COR-Matrix is a Node.js SDK and CLI that analyzes AI code retention patterns by tracking how much AI-generated code remains in your codebase versus how much gets modified or removed over time. The HAI Code Generator automatically tracks file operations performed by the AI assistant and sends this data to COR-Matrix for analysis.

This provides valuable insights into:

- **AI Code Longevity**: Whether AI-generated code tends to be temporary scaffolding or permanent solutions
- **Code Evolution**: How developers iterate on AI-generated code
- **Retention Rates**: What percentage of AI-generated code survives in the final codebase
- **Usage Patterns**: Understanding the real-world effectiveness of AI coding assistance

For detailed information about COR-Matrix SDK and CLI, see the [official documentation](https://www.npmjs.com/package/@presidio-dev/cor-matrix).

## How It Works

The HAI Code Generator conditionally tracks file operations through the `CorMatrixService` only when **all** conditions are met:

1. The AI assistant performs a file modification or creation
2. The operation contains valid file content with line-level changes
3. Required COR-Matrix configuration is present in your workspace
4. The COR-Matrix service is available and properly configured

> **Important Note**: Your actual source code **never leaves your system**. Only cryptographic hash signatures are generated locally and sent to COR-Matrix for analysis. All data is encrypted in transit and at rest. Tracking runs in the background with batch processing, ensuring **zero impact** on AI assistant performance.

## Privacy & Security

COR-Matrix integration is designed with privacy and security in mind:

- **Your Code Stays Local**: Your actual source code **never leaves your development environment**
- **Hash-Only Transmission**: Only cryptographic hash signatures are generated locally and sent to COR-Matrix
- **Encryption**: All transmitted data is encrypted in transit and at rest
- **Selective Tracking**: Only AI-generated code additions are monitored (deletions are ignored)
- **Background Processing**: Tracking uses batching and background processing for zero performance impact

## Configuration

COR-Matrix integration is **completely optional** and activates only when configured.

### Workspace Configuration

Create a `.hai.config` file in your workspace root with the following COR-Matrix settings:

```
# COR-Matrix Configuration
cormatrix.baseURL=https://your-cormatrix-instance.com
cormatrix.token=your-api-token
cormatrix.workspaceId=your-workspace-id
```

### Configuration Parameters

- **`baseURL`**: Your COR-Matrix server endpoint
- **`token`**: Authentication token for COR-Matrix API
- **`workspaceId`**: Unique identifier for your workspace

All parameters are optional, but the integration will only activate when all required parameters are provided.

### Configuration File Security

> **Important**: The `.hai.config` file is not git-excluded by default. Ensure sensitive tokens are not committed unintentionally to your repository.

## Optional Integration

COR-Matrix integration provides graceful operation:

- **Default Behavior**: HAI Code Generator operates normally without COR-Matrix configuration
- **Silent Activation**: Integration only activates when required configuration is present
- **Graceful Degradation**: If COR-Matrix service is unavailable, the AI assistant continues working unaffected
- **Zero Performance Impact**: All tracking happens in the background without affecting your development workflow

## How Tracking Works

The integration automatically:

1. **Monitors File Operations**: Tracks when the AI assistant modifies or creates files
2. **Captures Line Diffs**: Records line-by-line changes made by the AI
3. **Processes Added Code**: Only tracks newly added code (deletions are ignored)
4. **Generates Hashes**: Creates cryptographic signatures of the added code locally
5. **Transmits Safely**: Sends only hash signatures and metadata to COR-Matrix
6. **Associates with Files**: Links generated code signatures to specific file paths

## Troubleshooting

### Integration Not Working

If COR-Matrix integration isn't tracking changes:

1. **Check Configuration**: Ensure all required parameters are set in `.hai.config`
2. **Verify Connectivity**: Test connection to your COR-Matrix instance
3. **Review Logs**: Check HAI Code Generator logs for COR-Matrix-related errors
4. **Validate Credentials**: Confirm your token and workspace ID are correct

### Performance Concerns

COR-Matrix integration is designed for zero performance impact:

- All processing happens in background threads
- Batch processing minimizes network requests
- Local hash generation is computationally lightweight
- Graceful degradation prevents blocking operations

### Privacy Questions

**Q: What data is sent to COR-Matrix?**
A: Only cryptographic hash signatures of added code and associated file paths. Your actual source code never leaves your system.

**Q: Can COR-Matrix reconstruct my code from hashes?**
A: No. Cryptographic hashes are one-way functions that cannot be reversed to reveal the original code.

**Q: Is tracking mandatory?**
A: No. COR-Matrix integration is completely optional and only activates when explicitly configured.

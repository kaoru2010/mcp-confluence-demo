# mcp-confluence-demo

A Model Context Protocol (MCP) server for Confluence integration with auto-generated content management.

## Features

- **MCP Server**: JSON-RPC based tools for AI integration
- **CLI Tools**: Direct command-line interface for testing
- **Auto-Generated Content**: Manage content between `BEGIN_AUTO_GENERATED` and `END_AUTO_GENERATED` markers
- **DOM-based Processing**: Robust HTML parsing with cheerio
- **Safe Updates**: Preserves document structure and formatting

## Prerequisites

This project uses [mise](https://mise.jdx.dev/) for tool version management.

## Setup

1. Install required tools:
```bash
mise install
pnpm install
```

2. Set environment variables:
```bash
export JIRA_API_TOKEN="your-jira-api-token"
export CONFLUENCE_EMAIL="your-email@company.com"

# Optional: Set log level (DEBUG, INFO, WARN, ERROR)
export LOG_LEVEL="INFO"
```

3. Build the project:
```bash
pnpm build
```

## Usage

### MCP Server

Use as an MCP server for AI integration:

```bash
# Start MCP server
pnpm mcp

# Or with development build
pnpm mcp:dev
```

#### MCP Tools

- **confluence_read**: Read auto-generated content from Confluence page
- **confluence_update**: Update auto-generated content in Confluence page  
- **confluence_info**: Get Confluence page information

### CLI Tools

Direct command-line usage:

```bash
# Get page information
pnpm confluence info "https://your-domain.atlassian.net/wiki/spaces/SPACE/pages/ID/PAGE"

# Read auto-generated content
pnpm confluence read "https://your-domain.atlassian.net/wiki/spaces/SPACE/pages/ID/PAGE"

# Update auto-generated content
pnpm confluence update "https://your-domain.atlassian.net/wiki/spaces/SPACE/pages/ID/PAGE" "New content"
```

## Architecture

- **DOM Processing**: Uses cheerio for robust HTML manipulation
- **Marker Detection**: Finds `BEGIN_AUTO_GENERATED`/`END_AUTO_GENERATED` by text content
- **Structure Preservation**: Maintains HTML structure while updating only marked sections
- **Error Handling**: Comprehensive error handling for API and parsing failures
- **Structured Logging**: Detailed logging with emoji icons and different levels (DEBUG, INFO, WARN, ERROR)

## Logging

The MCP server includes comprehensive logging for monitoring and debugging:

### Log Levels
- **DEBUG** 🐛: Detailed execution information
- **INFO** ℹ️: General operational messages  
- **WARN** ⚠️: Warning conditions
- **ERROR** ❌: Error conditions

### Log Types
- **🚀 Server Events**: Start/stop operations
- **🔧 Tool Execution**: Tool start/complete/error with execution time
- **🌍 API Calls**: Confluence API requests/responses with timing
- **📖 Page Operations**: Read/update/info operations with page details
- **🔐 Authentication**: Masked sensitive information

### Configuration
Set log level via environment variable:
```bash
export LOG_LEVEL=DEBUG  # Show all logs
export LOG_LEVEL=INFO   # Default level
export LOG_LEVEL=ERROR  # Only errors
```

## Tools

- Node.js: 22.13.1
- pnpm: 10.11.1
- TypeScript: 5.9.3
- MCP SDK: 1.20.0
- cheerio: 1.1.2
- axios: 1.12.2

## License

Apache License 2.0


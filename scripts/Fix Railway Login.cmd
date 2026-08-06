@echo off
REM Double-click this to stop the Railway MCP logging out every hour.
REM
REM The stored `railway login` credential is an OAuth token with a 60-minute
REM life. The MCP server is a long-running process that caches it at startup, so
REM an hour in, every Railway tool call fails until the editor is restarted.
REM This swaps it for an account token, which does not expire.
REM
REM All the work is in railway-mcp-token.mjs; this only makes it clickable.

cd /d "%~dp0.."
node "scripts\railway-mcp-token.mjs"

echo.
pause

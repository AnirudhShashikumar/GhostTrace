"""Response policy shared by local serving and generated deployment configuration."""
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; "
    "form-action 'none'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'",
}

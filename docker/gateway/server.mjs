// Local stand-in for API Gateway (HTTP API, payload format 2.0).
// Converts plain HTTP requests into Lambda events, invokes the Bref runtime
// container through the Lambda Runtime Interface Emulator (RIE), and converts
// the Lambda response back into an HTTP response.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8000);
const LAMBDA_URL =
    process.env.LAMBDA_URL ?? 'http://web:8080/2015-03-31/functions/function/invocations';

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|image\/svg)/;

function toEvent(req, body) {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
        // API Gateway overwrites forwarding headers; never trust client-supplied ones.
        if (name === 'cookie' || name.startsWith('x-forwarded-')) continue;
        headers[name] = Array.isArray(value) ? value.join(',') : value;
    }
    headers['x-forwarded-for'] = req.socket.remoteAddress ?? '127.0.0.1';
    headers['x-forwarded-proto'] = 'http';
    headers['x-forwarded-port'] = String(req.socket.localPort ?? PORT);
    const cookies = req.headers.cookie
        ? req.headers.cookie.split(/;\s*/).filter(Boolean)
        : undefined;
    const contentType = req.headers['content-type'] ?? '';
    const isBase64Encoded = body.length > 0 && !TEXT_TYPES.test(contentType);
    const now = new Date();

    return {
        version: '2.0',
        routeKey: '$default',
        rawPath: url.pathname,
        rawQueryString: url.search.slice(1),
        cookies,
        headers,
        queryStringParameters: url.search
            ? Object.fromEntries(url.searchParams.entries())
            : undefined,
        requestContext: {
            accountId: 'local',
            apiId: 'local',
            domainName: url.host,
            domainPrefix: url.hostname.split('.')[0],
            http: {
                method: req.method,
                path: url.pathname,
                protocol: `HTTP/${req.httpVersion}`,
                sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
                userAgent: req.headers['user-agent'] ?? '',
            },
            requestId: randomUUID(),
            routeKey: '$default',
            stage: '$default',
            time: now.toUTCString(),
            timeEpoch: now.getTime(),
        },
        body: body.length > 0 ? body.toString(isBase64Encoded ? 'base64' : 'utf8') : undefined,
        isBase64Encoded,
    };
}

// The RIE handles a single invocation at a time and crashes on concurrent
// invokes. Serialize invocations, like a function with reserved concurrency 1
// (AWS would throttle instead of queueing, which is fine for local use).
let queue = Promise.resolve();
function invoke(event) {
    const run = queue.then(() =>
        fetch(LAMBDA_URL, { method: 'POST', body: JSON.stringify(event) }).then((r) => r.json()),
    );
    queue = run.catch(() => {});
    return run;
}

const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const event = toEvent(req, Buffer.concat(chunks));
    const started = Date.now();

    try {
        const result = await invoke(event);

        if (result?.errorMessage || typeof result?.statusCode !== 'number') {
            throw new Error(`Invalid Lambda response: ${JSON.stringify(result).slice(0, 500)}`);
        }

        const headers = { ...(result.headers ?? {}) };
        if (result.cookies?.length) headers['set-cookie'] = result.cookies;
        const body = result.body
            ? Buffer.from(result.body, result.isBase64Encoded ? 'base64' : 'utf8')
            : Buffer.alloc(0);

        res.writeHead(result.statusCode, headers);
        res.end(body);
        console.log(`${req.method} ${req.url} -> ${result.statusCode} (${Date.now() - started}ms)`);
    } catch (err) {
        console.error(`${req.method} ${req.url} -> 502`, err);
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Bad Gateway: ${err.message}\n`);
    }
});

server.listen(PORT, () =>
    console.log(`API Gateway emulator listening on :${PORT} -> ${LAMBDA_URL}`),
);

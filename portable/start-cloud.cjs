'use strict';

const { createServer } = require('../v21/platform/server.cjs');
const { PORT = '8080', LENS_PUBLIC_ORIGIN, LENS_CLOUDBASE_ENV, LENS_DATABASE_TOKEN } = process.env;
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid PORT');
if (!LENS_CLOUDBASE_ENV || !LENS_DATABASE_TOKEN) throw Error('CloudBase environment and server credential are required');
const origin = new URL(LENS_PUBLIC_ORIGIN);
if (origin.protocol !== 'https:' || origin.origin !== LENS_PUBLIC_ORIGIN) {
 throw Error('LENS_PUBLIC_ORIGIN must be a single HTTPS origin without a trailing slash');
}

const { server } = createServer();
server.listen(port, '0.0.0.0', () => console.log(`Olist Lens listening on ${port}`));

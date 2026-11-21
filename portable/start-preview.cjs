'use strict';

const { createServer } = require('../v21/platform/server.cjs');
const port = Number(process.env.LENS_PLATFORM_PORT || 8794);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');

const { server } = createServer({ env: {} });
server.listen(port, '127.0.0.1', () => {
 console.log(`Olist Lens preview: http://127.0.0.1:${port}/`);
});

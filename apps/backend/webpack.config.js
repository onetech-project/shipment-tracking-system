module.exports = function (options) {
  return {
    ...options,
    externals: [
      function ({ request }, callback) {
        // Always bundle local workspace packages (@shared/*)
        if (request.startsWith('@shared/')) {
          return callback();
        }
        // Externalize all npm packages (scoped and unscoped) so native
        // modules like bcrypt/pg are never passed through webpack loaders.
        if (/^(@[a-z0-9-~][a-z0-9-._~]*\/|[a-z0-9-~])/.test(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ],
  };
};

const VALID_DEFINE_ENV_KEY = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function stringifyEnvDefine(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

function createDefineMap(env = process.env) {
  const define = {};

  for (const key in env) {
    // Skip env vars with invalid identifier characters for esbuild defines.
    if (VALID_DEFINE_ENV_KEY.test(key)) {
      define[`process.env.${key}`] = stringifyEnvDefine(env[key]);
    }
  }

  define['process.env.IPFS_PREVIEW_URL'] = stringifyEnvDefine(
    env.IPFS_PREVIEW_URL,
  );
  define['process.env.SECRET_KEY'] = stringifyEnvDefine(env.SECRET_KEY);

  return define;
}

module.exports = {
  createDefineMap,
  stringifyEnvDefine,
};

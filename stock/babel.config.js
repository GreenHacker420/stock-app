module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-react-compiler', { target: '18' }],
      'nativewind/babel',
    ],
  };
};

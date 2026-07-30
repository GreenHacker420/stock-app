const { AndroidConfig, withAndroidStyles } = require("expo/config-plugins");

module.exports = function withAndroidNavigationBarBackground(config) {
  return withAndroidStyles(config, (androidConfig) => {
    androidConfig.modResults = AndroidConfig.Styles.assignStylesValue(
      androidConfig.modResults,
      {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: "android:navigationBarColor",
        value: "#ffffff",
      },
    );
    return androidConfig;
  });
};

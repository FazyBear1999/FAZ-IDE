const filePairs = [
  ["index.html", "dist_site/index.html"],
  ["manifest.webmanifest", "dist_site/manifest.webmanifest"],
  ["favicon.ico", "dist_site/favicon.ico"],
  [".htaccess", "dist_site/.htaccess"],
];

const dirPairs = [
  ["assets/css", "dist_site/assets/css"],
  ["assets/games", "dist_site/assets/games"],
  ["assets/icons", "dist_site/assets/icons"],
  ["assets/js", "dist_site/assets/js"],
  ["assets/vendor", "dist_site/assets/vendor"],
];

module.exports = {
  dirPairs,
  filePairs,
};

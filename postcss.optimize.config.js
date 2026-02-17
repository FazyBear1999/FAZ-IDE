module.exports = {
  plugins: [
    require("postcss-combine-duplicated-selectors")({
      removeDuplicatedProperties: true,
    }),
    require("postcss-merge-rules")(),
    require("cssnano")({ preset: "default" }),
  ],
};
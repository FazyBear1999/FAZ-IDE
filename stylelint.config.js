module.exports = {
  extends: ["stylelint-config-standard"],
  rules: {
    "declaration-no-important": null,
    "color-no-invalid-hex": true,
    "block-no-empty": true,
    "declaration-block-no-duplicate-properties": [
      true,
      {
        ignore: ["consecutive-duplicates-with-different-values"]
      }
    ],
    "no-duplicate-selectors": true,
    "keyframe-block-no-duplicate-selectors": true,
    "no-descending-specificity": null,
    "declaration-empty-line-before": null,
    "declaration-block-no-redundant-longhand-properties": null,
    "declaration-block-no-shorthand-property-overrides": null,
    "declaration-property-value-keyword-no-deprecated": null,
    "selector-max-id": null,
    "selector-max-type": null,
    "selector-max-universal": null,
    "selector-max-combinators": null,
    "selector-max-compound-selectors": null,
    "selector-max-specificity": null,
    "selector-id-pattern": null,
    "selector-class-pattern": null,
    "selector-no-vendor-prefix": null,
    "color-hex-length": null,
    "value-keyword-case": null,
    "shorthand-property-no-redundant-values": null,
    "property-no-deprecated": null,
    "media-feature-range-notation": null,
    "custom-property-empty-line-before": null,
    "rule-empty-line-before": null,
    "comment-empty-line-before": null,
    "alpha-value-notation": null,
    "color-function-alias-notation": null,
    "color-function-notation": null,
    "no-duplicate-selectors": null,
    "property-no-vendor-prefix": null,
    "value-no-vendor-prefix": null
  }
};
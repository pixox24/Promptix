# Hide Template Card Output-Type Label

## Goal

Reduce visual noise on homepage and library template cards by hiding the output-type pill rendered over each cover image.

## Scope

- Remove the `outputTypeLabel` pill from the image overlay in `TemplateCard`.
- Keep the template title on the cover image.
- Keep the green metadata tags below the image.
- Keep `outputTypeLabel` in the data model, API, administration UI, and filtering behavior.
- Apply the change everywhere that reuses `TemplateCard`.

## Verification

- Add a regression test confirming `TemplateCard` no longer renders `template.outputTypeLabel`.
- Run the web test suite and production build.
- Inspect the homepage in the browser and confirm the image overlay contains only the title.

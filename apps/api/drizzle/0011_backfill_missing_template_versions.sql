INSERT INTO "template_versions" ("template_id", "version", "snapshot", "source")
SELECT
	"id",
	1,
	jsonb_build_object(
		'templateId', "id",
		'version', 1,
		'id', "id",
		'name', "name",
		'summary', "summary",
		'description', "description",
		'category', "category",
		'workflowType', "workflow_type",
		'semantic', jsonb_build_object(
			'workflowType', "workflow_type",
			'outputType', (select "slug" from "taxonomy_terms" where "taxonomy_terms"."id" = "prompt_templates"."output_type_id"),
			'scenarios', coalesce((select jsonb_agg("taxonomy_terms"."slug" order by "taxonomy_terms"."slug") from "template_taxonomy_assignments" inner join "taxonomy_terms" on "taxonomy_terms"."id" = "template_taxonomy_assignments"."term_id" where "template_taxonomy_assignments"."template_id" = "prompt_templates"."id" and "taxonomy_terms"."dimension" = 'scenario'), '[]'::jsonb),
			'styles', coalesce((select jsonb_agg("taxonomy_terms"."slug" order by "taxonomy_terms"."slug") from "template_taxonomy_assignments" inner join "taxonomy_terms" on "taxonomy_terms"."id" = "template_taxonomy_assignments"."term_id" where "template_taxonomy_assignments"."template_id" = "prompt_templates"."id" and "taxonomy_terms"."dimension" = 'style'), '[]'::jsonb),
			'subjects', coalesce((select jsonb_agg("taxonomy_terms"."slug" order by "taxonomy_terms"."slug") from "template_taxonomy_assignments" inner join "taxonomy_terms" on "taxonomy_terms"."id" = "template_taxonomy_assignments"."term_id" where "template_taxonomy_assignments"."template_id" = "prompt_templates"."id" and "taxonomy_terms"."dimension" = 'subject'), '[]'::jsonb),
			'tags', to_jsonb("tags"),
			'unmappedTerms', "unmapped_terms",
			'confidence', coalesce("classification_meta"->'confidence', '{}'::jsonb)
		),
		'outputTypeId', "output_type_id",
		'tags', "tags",
		'scenarios', "scenarios",
		'taxonomyReviewStatus', "taxonomy_review_status",
		'unmappedTerms', "unmapped_terms",
		'classificationMeta', "classification_meta",
		'variables', "variables",
		'promptTemplate', "prompt_template",
		'negativePrompt', "negative_prompt",
		'coverObjectKey', "cover_object_key",
		'coverUrl', "cover_url",
		'status', "status",
		'isFeatured', "is_featured",
		'featuredOrder', "featured_order",
		'isHot', "is_hot",
		'source', "source",
		'sourceMeta', "source_meta",
		'modelHints', "model_hints",
		'locale', "locale",
		'i18n', "i18n",
		'publishedAt', "published_at"
	),
	'migration'
FROM "prompt_templates"
ON CONFLICT ("template_id", "version") DO NOTHING;

import { eq } from 'drizzle-orm';
import { loadEnv } from '../config/env.js';
import { getDb, getSql } from './client.js';
import { adminUsers } from './schema.js';
import { promptTemplates, taxonomyTerms, templateTaxonomyAssignments } from './schema.js';
import { hashPassword } from '../lib/password.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function main() {
  loadEnv();
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required for seed',
    );
  }

  const db = getDb();
  const normalized = email.toLowerCase();
  const [existing] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, normalized))
    .limit(1);

  if (existing) {
    console.log('[seed] admin already exists:', normalized);
  } else {
    const passwordHash = await hashPassword(password);
    await db.insert(adminUsers).values({
      email: normalized,
      passwordHash,
      displayName: 'Owner',
      role: 'owner',
    });
    console.log('[seed] created admin:', normalized);
  }

  const sourcePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../apps/web/src/data/templates.ts');
  const source = (await import(pathToFileURL(sourcePath).href)) as {
    templates: Array<{
      id:string; name:string; summary:string; description:string; coverImage:string;
      category:string; tags:string[]; variables:unknown[]; promptTemplate:string;
      scenarios:string[]; isFeatured?:boolean; featuredOrder?:number; isHot?:boolean;
      favoriteCount:number; useCount:number; createdAt:string;
    }>;
  };
  const terms = await db.select().from(taxonomyTerms);
  const outputSlugByLegacyCategory: Record<string, string> = {
    portrait: 'portrait', ecommerce: 'product_image', poster: 'poster', logo: 'logo',
    illustration: 'illustration', edit: 'general_visual',
  };
  const termMatches = (term: typeof taxonomyTerms.$inferSelect, values: string[]) =>
    values.includes(term.label) || term.aliases.some((alias) => values.includes(alias));
  for (const template of source.templates) {
    const outputType = terms.find((term) => term.dimension === 'output_type' && term.slug === outputSlugByLegacyCategory[template.category]);
    await db.insert(promptTemplates).values({
      id:template.id,name:template.name,summary:template.summary,description:template.description,
      coverObjectKey:`external/${template.id}`,coverUrl:template.coverImage,category:template.category,
      tags:template.tags,variables:template.variables,promptTemplate:template.promptTemplate,
      scenarios:template.scenarios,isFeatured:template.isFeatured??false,featuredOrder:template.featuredOrder??0,isHot:template.isHot??false,
      workflowType:template.category === 'edit' ? 'edit' : 'generate',outputTypeId:outputType?.id,
      taxonomyReviewStatus:'reviewed',unmappedTerms:[],
      favoriteCount:template.favoriteCount,useCount:template.useCount,status:'published',source:'manual',
      publishedAt:new Date(template.createdAt),createdBy:existing?.id,
    }).onConflictDoUpdate({target:promptTemplates.id,set:{
      name:template.name,summary:template.summary,description:template.description,coverUrl:template.coverImage,
      category:template.category,tags:template.tags,variables:template.variables,promptTemplate:template.promptTemplate,
      scenarios:template.scenarios,isFeatured:template.isFeatured??false,featuredOrder:template.featuredOrder??0,isHot:template.isHot??false,
      workflowType:template.category === 'edit' ? 'edit' : 'generate',outputTypeId:outputType?.id,
      taxonomyReviewStatus:'reviewed',unmappedTerms:[],
      favoriteCount:template.favoriteCount,useCount:template.useCount,updatedAt:new Date(),
    }});
    const classificationValues = [...template.scenarios, ...template.tags];
    const assignments = terms.filter((term) =>
      ['scenario', 'style', 'subject'].includes(term.dimension) && termMatches(term, classificationValues));
    await db.delete(templateTaxonomyAssignments).where(eq(templateTaxonomyAssignments.templateId, template.id));
    if (assignments.length) {
      await db.insert(templateTaxonomyAssignments).values(assignments.map((term) => ({
        templateId: template.id, termId: term.id, source: 'migration',
      })));
    }
  }
  console.log(`[seed] upserted ${source.templates.length} templates`);

  await getSql().end({ timeout: 5 });
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});

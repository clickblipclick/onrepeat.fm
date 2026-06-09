import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Denormalized copy of the user's chosen color theme (source of truth is the
  // fm.onrepeat.profile record in their repo). Nullable: a null/unknown value
  // renders the deterministic default derived from the DID. See @onrepeat/core resolveTheme.
  await db.schema
    .alterTable('actors')
    .addColumn('color_theme', 'text')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('actors').dropColumn('color_theme').execute()
}

/** Protocol identities persisted for the experimental A2UI v1 renderer. */

/** A2UI Basic Catalog identifier accepted by the Host validator. */
export const A2UI_BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'

/**
 * Catalog identifier for the business components this renderer adds beside the
 * Basic Catalog. A Surface that uses them must name this catalog; the Basic
 * Catalog identifier keeps admitting only the standard components.
 */
export const A2UI_TASK_CATALOG_ID = 'https://dsh.dev/a2ui/catalogs/task/v1'

/** Metadata discriminator used by Client renderers before parsing messages. */
export const A2UI_META_PROTOCOL = 'a2ui/v1'

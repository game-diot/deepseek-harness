/** Catalogs this renderer accepts: the Basic Catalog and its business additions. */

import { Catalog } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import { taskComponents } from './business-components.tsx'

/** Catalog identifier the business components belong to. */
export const TASK_CATALOG_ID = 'https://dsh.dev/a2ui/catalogs/task/v1'

/**
 * The Basic Catalog plus this renderer's business components.
 *
 * A Surface naming this catalog may use either set; a Surface naming the Basic
 * Catalog keeps a third-party renderer able to draw it.
 */
export const taskCatalog = new Catalog(
  TASK_CATALOG_ID,
  '1.0',
  [...basicCatalog.components.values(), ...taskComponents] as never,
  [...basicCatalog.functions.values()],
)

/** Catalogs handed to every card's processor. */
export const catalogs = [basicCatalog, taskCatalog]

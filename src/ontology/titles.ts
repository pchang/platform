import type * as oxigraph from 'oxigraph';
import { NS, select } from './ontology';

/**
 * Titles (platform spec 3.1, Title): how a type names its objects for people, from templates in the ontology.
 *
 *   "{ls:reaction} with {ls:concerns} | Case from {ls:originatesFrom:id}"
 *
 * Alternatives are separated by " | "; the first whose placeholders all have values is used. A placeholder is a
 * prefixed property: its literal value, a coded value's label, or a linked object's own title (one level deep, then
 * its identifier). With ":id", a linked object's identifier. Several values are joined with commas, in order.
 */

const PLACEHOLDER = /\{([a-z]+):([A-Za-z0-9]+)(:id)?\}/g;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The placeholders a template uses, as property IRIs, so tests can check no title uses a hidden value. */
export function templateProperties(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map(([, prefix, local]) => `${(NS as Record<string, string>)[prefix]}${local}`);
}

/** An object's title from its type's template; undefined when the type has none or no alternative is complete. */
export function titleOf(store: oxigraph.Store, object: string, depth = 1): string | undefined {
  const template = select(store, `SELECT ?t WHERE { <${object}> a ?type . ?type a p:ObjectType ; p:titleTemplate ?t }`)[0]?.t;
  if (!template) return undefined;
  for (const alternative of template.split(' | ')) {
    let complete = true;
    const text = alternative.replace(PLACEHOLDER, (_match, prefix: string, local: string, id?: string) => {
      const namespace = (NS as Record<string, string>)[prefix];
      if (!namespace) {
        complete = false;
        return '';
      }
      const values = select(
        store,
        `SELECT ?v ?label ?order ?identifier WHERE { <${object}> <${namespace}${local}> ?v .
          OPTIONAL { ?v skos:prefLabel ?label } OPTIONAL { ?v p:order ?order } OPTIONAL { ?v ls:identifier ?identifier } }
         ORDER BY ?order ?label ?identifier ?v`,
      ).map((r) => {
        if (r.identifier) return id || depth === 0 ? r.identifier : (titleOf(store, r.v, depth - 1) ?? r.identifier);
        return r.label ?? r.v;
      });
      if (!values.length) complete = false;
      return values.join(', ');
    });
    if (complete && text.trim()) return capitalize(text.trim());
  }
  return undefined;
}

/** How the views name things in running text, from the ontology's labels (design system spec 4.3). */

/** A type's name in running text: lower case, except words that start in capitals, such as CAPA and CAPAs. */
export const inText = (name: string) =>
  name
    .split(' ')
    .map((word) => (/^[A-Z]{2}/.test(word) ? word : word.toLowerCase()))
    .join(' ');

/** A count of one type's objects, named for the type: "12 patients", "1 safety case", "0 CAPAs" (design system spec 4.3). */
export const counted = (count: number, label: string, pluralLabel: string) => `${count} ${inText(count === 1 ? label : pluralLabel)}`;

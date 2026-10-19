// The English and French catalogs of the Diagram Module, with the texts of the living-documentation editor where it had one.
// The language follows the `locale` of the handshake; English is the default.

const en = {
  loading: "Loading…",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  load_retry: "Try again",

  sidebar_title: "Diagrams",
  sidebar_new: "+ New",
  sidebar_empty: "No diagrams",
  delete_diagram: "Delete {title}",
  confirm_delete_title: "Delete this diagram?",
  confirm_delete_msg: "“{title}” and everything drawn in it will be deleted. This action is irreversible.",
  new_diagram: "New diagram",
  untitled: "Untitled",
  empty_state: "Select or create a diagram",

  title_label: "Diagram title",
  tools: "Tools",
  tool_select: "Select (V)",
  tool_rect: "Rectangle (R)",
  tool_arrow: "Arrow (F)",
  saved: "Saved",
  saving: "Saving…",
  save_failed: "Save failed",

  canvas: "Canvas",
  shape: "Rectangle",
  shape_named: "Rectangle {text}",
  arrow_between: "Arrow from {from} to {to}",
  text_label: "Text of the shape",

  load_error: "Your diagrams could not be read ({reason}). Nothing can be changed until they are read, so that nothing is lost.",
  save_error: "Your last change could not be saved ({reason}). It is still on screen, but will be lost when you leave.",
  save_error_quota: "Your last change could not be saved: the storage of the Diagram Module is full. It is still on screen, but will be lost when you leave.",
};

type Messages = typeof en;

const fr: Messages = {
  loading: "Chargement…",
  cancel: "Annuler",
  save: "Enregistrer",
  delete: "Supprimer",
  load_retry: "Réessayer",

  sidebar_title: "Diagrammes",
  sidebar_new: "+ Nouveau",
  sidebar_empty: "Aucun diagramme",
  delete_diagram: "Supprimer {title}",
  confirm_delete_title: "Supprimer ce diagramme ?",
  confirm_delete_msg: "« {title} » et tout ce qui y est dessiné seront supprimés. Cette action est irréversible.",
  new_diagram: "Nouveau diagramme",
  untitled: "Sans titre",
  empty_state: "Sélectionnez ou créez un diagramme",

  title_label: "Titre du diagramme",
  tools: "Outils",
  tool_select: "Sélection (V)",
  tool_rect: "Rectangle (R)",
  tool_arrow: "Flèche (F)",
  saved: "Enregistré",
  saving: "Enregistrement…",
  save_failed: "Échec de l'enregistrement",

  canvas: "Canevas",
  shape: "Rectangle",
  shape_named: "Rectangle {text}",
  arrow_between: "Flèche de {from} vers {to}",
  text_label: "Texte de la forme",

  load_error: "Vos diagrammes n'ont pas pu être lus ({reason}). Rien ne peut être modifié tant qu'ils ne sont pas lus, pour ne rien perdre.",
  save_error: "Votre dernière modification n'a pas pu être enregistrée ({reason}). Elle reste à l'écran, mais sera perdue en quittant.",
  save_error_quota:
    "Votre dernière modification n'a pas pu être enregistrée : le stockage du Module Diagram est plein. Elle reste à l'écran, mais sera perdue en quittant.",
};

export type MessageKey = keyof Messages;

let messages: Messages = en;

/** Chooses the catalog for a BCP 47 tag, such as "fr-FR"; English for any other language. */
export function setLocale(locale: string): void {
  messages = locale.toLowerCase().split("-")[0] === "fr" ? fr : en;
}

/** The message in the current language, with each `{name}` replaced by its value. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** The title of a diagram as shown: an empty title reads "Untitled". */
export const titleOf = (title: string): string => title.trim() || t("untitled");

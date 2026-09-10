import { FieldValue as FirestoreFieldValue } from "firebase-admin/firestore";
import { localFieldValues } from "../../mini-pc/document-store.mjs";
export const FieldValue = {
  delete: () =>
    process.env.OURA_DB_PATH
      ? localFieldValues.delete()
      : FirestoreFieldValue.delete(),
  increment: (value: number) =>
    process.env.OURA_DB_PATH
      ? localFieldValues.increment(value)
      : FirestoreFieldValue.increment(value),
};

import * as lite from "firebase/firestore/lite";
import * as remote from "./documentClient";
const enabled = Boolean(import.meta.env.VITE_OURA_API_URL);
export const collection = (...args: any[]): any =>
  enabled ? remote.collection(...args) : (lite.collection as any)(...args);
export const doc = (...args: any[]): any =>
  enabled ? remote.doc(...args) : (lite.doc as any)(...args);
export const getDoc = (...args: any[]): any =>
  enabled ? (remote.getDoc as any)(...args) : (lite.getDoc as any)(...args);
export const getDocs = (...args: any[]): any =>
  enabled ? (remote.getDocs as any)(...args) : (lite.getDocs as any)(...args);
export const query = (...args: any[]): any =>
  enabled ? remote.query(...args) : (lite.query as any)(...args);
export const limit = (...args: any[]): any =>
  enabled ? remote.limit(...args) : (lite.limit as any)(...args);
export const orderBy = (...args: any[]): any =>
  enabled ? remote.orderBy(...args) : (lite.orderBy as any)(...args);

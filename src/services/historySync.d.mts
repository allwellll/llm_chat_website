import type { Conversation, Project, Artifact } from '../types';
export interface HistorySnapshot { conversations: Conversation[]; projects: Project[]; artifacts: Artifact[] }
export interface HistoryStatus {ready:boolean;error:string;notice:string;pending:number;saving:boolean}
export function readLegacy(storage:Storage):HistorySnapshot;
export class HistorySync {
 constructor(options:{onChange:(snapshot:HistorySnapshot)=>void;onStatus:(status:HistoryStatus)=>void});
 ready:boolean;
 next:string|null;
 load(kind:string,id:string):Promise<any>;
 more():Promise<void>;
 search(q:string,cursor?:string):Promise<any>;
 clearConversations():Promise<void>;
 start():Promise<void>;
 update(snapshot:HistorySnapshot):void;
 snapshot():HistorySnapshot;
 flush():Promise<void>;
 refresh():Promise<void>;
}

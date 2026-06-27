import { ChatMessage } from '../types';

export class ConversationMemory {
  private readonly messages: ChatMessage[] = [];

  public add(message: ChatMessage): void {
    this.messages.push(message);
  }

  public getAll(): ChatMessage[] {
    return [...this.messages];
  }

  public clear(): void {
    this.messages.length = 0;
  }
}

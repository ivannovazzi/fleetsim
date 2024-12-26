export class BinaryHeap<T> {
  private heap: T[] = [];
  
  constructor(private compare: (a: T, b: T) => number) {}
  
  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }
  
  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const result = this.heap[0];
    const end = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return result;
  }
  
  peek(): T | undefined {
    return this.heap[0];
  }
  
  get size(): number {
    return this.heap.length;
  }
  
  private bubbleUp(n: number): void {
    const element = this.heap[n];
    while (n > 0) {
      const parentN = Math.floor((n - 1) / 2);
      const parent = this.heap[parentN];
      if (this.compare(element, parent) >= 0) break;
      this.heap[parentN] = element;
      this.heap[n] = parent;
      n = parentN;
    }
  }
  
  private sinkDown(n: number): void {
    const length = this.heap.length;
    const element = this.heap[n];
    
    while (true) {
      let swap = null;
      const leftN = 2 * n + 1;
      const rightN = 2 * n + 2;
      
      if (leftN < length) {
        const left = this.heap[leftN];
        if (this.compare(left, element) < 0) swap = leftN;
      }
      
      if (rightN < length) {
        const right = this.heap[rightN];
        if (this.compare(right, swap === null ? element : this.heap[leftN]) < 0) {
          swap = rightN;
        }
      }
      
      if (swap === null) break;
      this.heap[n] = this.heap[swap];
      this.heap[swap] = element;
      n = swap;
    }
  }
}
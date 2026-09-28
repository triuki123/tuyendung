'use client';

export function UserCardSkeleton() {
  return (
    <div className="p-4 rounded-2xl border border-line bg-hover animate-pulse">
      <div className="space-y-3">
        <div className="h-4 bg-hover-strong rounded-lg w-1/3"></div>
        <div className="h-3 bg-hover-strong rounded-lg w-1/2"></div>
        <div className="h-3 bg-hover-strong rounded-lg w-2/3"></div>
        <div className="flex gap-2 mt-4">
          <div className="h-8 bg-hover-strong rounded-lg flex-1"></div>
          <div className="h-8 bg-hover-strong rounded-lg flex-1"></div>
        </div>
      </div>
    </div>
  );
}

export function UserTableRowSkeleton() {
  return (
    <tr className="border-b border-line">
      <td className="px-6 py-4"><div className="h-4 bg-hover-strong rounded w-3/4 animate-pulse"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-hover-strong rounded w-1/2 animate-pulse"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-hover-strong rounded w-2/3 animate-pulse"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-hover-strong rounded w-1/3 animate-pulse"></div></td>
      <td className="px-6 py-4"><div className="h-4 bg-hover-strong rounded w-1/4 animate-pulse"></div></td>
    </tr>
  );
}

export function UsersListSkeleton({ count = 6, viewMode }: { count?: number; viewMode: 'card' | 'table' }) {
  if (viewMode === 'card') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <table className="w-full">
      <tbody>
        {Array.from({ length: count }).map((_, i) => (
          <UserTableRowSkeleton key={i} />
        ))}
      </tbody>
    </table>
  );
}

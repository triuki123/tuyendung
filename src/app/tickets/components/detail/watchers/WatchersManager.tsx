'use client';

import { Heart, Eye } from 'lucide-react';

interface WatchersManagerProps {
  ticketId: string;
  isFollowing: boolean;
  onFollow: (watch_type?: string) => Promise<void>;
  onUnfollow: () => Promise<void>;
}

export default function WatchersManager({
  isFollowing,
  onFollow,
  onUnfollow,
}: WatchersManagerProps) {
  return (
    <div className="bg-white p-6 rounded border border-gray-200">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Theo dõi ticket</h3>

      {isFollowing ? (
        <button
          onClick={onUnfollow}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors text-sm font-medium"
        >
          <Heart className="w-4 h-4 fill-current" />
          Bỏ theo dõi
        </button>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => onFollow('all')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white border border-blue-600 rounded hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            <Eye className="w-4 h-4" />
            Theo dõi tất cả
          </button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">hoặc</span>
            </div>
          </div>
          <button
            onClick={() => onFollow('comments')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm"
          >
            Chỉ bình luận
          </button>
          <button
            onClick={() => onFollow('status')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm"
          >
            Chỉ thay đổi trạng thái
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        Bạn sẽ nhận được thông báo về các cập nhật ticket này.
      </p>
    </div>
  );
}

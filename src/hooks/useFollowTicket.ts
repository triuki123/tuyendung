import { useState } from 'react';

/**
 * Hook để quản lý follow/unfollow ticket
 *
 * Usage:
 * const { isFollowing, loading, toggleFollow } = useFollowTicket(ticketId, currentUserId, initialFollowers);
 */
export function useFollowTicket(
  ticketId: string,
  userId: string,
  initialFollowers?: string[]
) {
  const [isFollowing, setIsFollowing] = useState<boolean>(
    initialFollowers ? initialFollowers.includes(userId) : false
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFollow = async () => {
    if (loading) return;

    const action = isFollowing ? 'unfollow' : 'follow';

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/tickets/${ticketId}/followers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Lỗi ${action === 'follow' ? 'theo dõi' : 'hủy theo dõi'}`);
      }

      const data = await response.json();

      // Update local state based on action result
      if (data.success) {
        setIsFollowing(action === 'follow' ? true : false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      setError(message);
      console.error(`useFollowTicket error (${action}):`, err);
    } finally {
      setLoading(false);
    }
  };

  return {
    isFollowing,
    loading,
    error,
    toggleFollow,
  };
}

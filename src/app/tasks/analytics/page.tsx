'use client';

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { AnalyticsDashboard } from '@/lib/services/taskAnalyticsService';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function TaskAnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/tasks/analytics');
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Đang tải...</div>;
  }

  if (!data) {
    return <div className="flex justify-center items-center min-h-screen">Không có dữ liệu</div>;
  }

  const { stats, timeStats, statusDistribution, userDistribution, departmentDistribution, trend } = data;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Bảng Điều Khiển Thống Kê Tasks</h1>
        <p className="text-gray-600 mb-8">Cập nhật lúc {new Date(data.lastUpdated).toLocaleString('vi-VN')}</p>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Tổng Tasks</p>
            <p className="text-3xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Hoàn Thành</p>
            <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Đang Xử Lý</p>
            <p className="text-3xl font-bold text-blue-600">{stats.inProgress}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Quá Hạn</p>
            <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-600 text-sm">Tỉ Lệ Hoàn Thành</p>
            <p className="text-3xl font-bold text-purple-600">{stats.completionRate}%</p>
          </div>
        </div>

        {/* Time Stats */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4">Thống Kê Thời Gian</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600 text-sm">Tổng Giờ Làm Việc</p>
              <p className="text-2xl font-bold">{timeStats.totalHours} h</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Tasks Có Ghi Giờ</p>
              <p className="text-2xl font-bold">{timeStats.taskCount}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Trung Bình Giờ/Task</p>
              <p className="text-2xl font-bold">{timeStats.averageHoursPerTask} h</p>
            </div>
          </div>
        </div>

        {/* Charts Row 1: Status & Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Status Distribution */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Phân Bố Theo Trạng Thái</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.status}: ${entry.count}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {statusDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Trend Chart */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Xu Hướng 30 Ngày Gần Đây</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" name="Tạo mới" />
                <Line type="monotone" dataKey="completed" stroke="#10b981" name="Hoàn thành" />
                <Line type="monotone" dataKey="overdue" stroke="#ef4444" name="Quá hạn" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2: User & Department */}
        {userDistribution.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-bold mb-4">Phân Bố Theo Người Dùng</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={userDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="user_name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="task_count" fill="#3b82f6" name="Tổng Tasks" />
                <Bar dataKey="completed_count" fill="#10b981" name="Hoàn Thành" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {departmentDistribution.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Phân Bố Theo Phòng Ban</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="organizationId" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="task_count" fill="#3b82f6" name="Tổng Tasks" />
                <Bar dataKey="completed_count" fill="#10b981" name="Hoàn Thành" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

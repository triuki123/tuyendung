import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Company {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
  parent_department_id?: string | null;
}

export interface JobTitle {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  is_active: boolean;
}

export interface SubDepartment {
  id: string;
  name: string;
  parent_department_id: string;
}

export interface DropdownCacheContextType {
  companies: Company[];
  companyDepartmentsMap: Record<string, Department[]>;
  subDepartmentsByDepartmentId: Record<string, SubDepartment[]>;
  jobTitles: Record<string, JobTitle[]>;
  positions: Record<string, Array<{ id: string; name: string }>>;
  allTags: Tag[];
  loading: boolean;
}

const DropdownCacheContext = createContext<DropdownCacheContextType | undefined>(undefined);

export function DropdownCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<DropdownCacheContextType>({
    companies: [],
    companyDepartmentsMap: {},
    subDepartmentsByDepartmentId: {},
    jobTitles: {},
    positions: {},
    allTags: [],
    loading: true,
  });

  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      // Fetch companies
      const companiesResponse = await fetch('/api/organizations/companies');
      if (!companiesResponse.ok) throw new Error('Failed to fetch companies');
      const companiesData = await companiesResponse.json();
      const companies = companiesData || [];

      // Fetch departments, job titles, positions for each company in parallel
      const deptMap: Record<string, Department[]> = {};
      const jobTitlesMap: Record<string, JobTitle[]> = {};
      const positionsMap: Record<string, Array<{ id: string; name: string }>> = {};
      const subDeptMap: Record<string, SubDepartment[]> = {};

      const promises = companies.map((company: any) =>
        Promise.all([
          fetch(`/api/organizations/departments?company_id=${company.id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => ({ companyId: company.id, departments: Array.isArray(data) ? data : [] }))
            .catch(() => ({ companyId: company.id, departments: [] })),
          fetch(`/api/v1/companies/${company.id}/job-titles`)
            .then(res => res.ok ? res.json() : { data: [] })
            .then(data => ({ companyId: company.id, jobTitles: data.data || data || [] }))
            .catch(() => ({ companyId: company.id, jobTitles: [] })),
          fetch(`/api/organizations/positions?company_id=${company.id}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => ({ companyId: company.id, positions: Array.isArray(data) ? data : [] }))
            .catch(() => ({ companyId: company.id, positions: [] })),
        ])
      );

      const results = await Promise.all(promises);

      results.forEach(([deptResult, jtResult, posResult]) => {
        if (deptResult.departments.length > 0) {
          deptMap[deptResult.companyId] = deptResult.departments.map((dept: any) => ({
            id: dept.id,
            name: dept.name,
            parent_department_id: dept.parent_department_id || null,
          }));
        }
        if (jtResult.jobTitles.length > 0) {
          jobTitlesMap[jtResult.companyId] = jtResult.jobTitles;
        }
        if (posResult.positions.length > 0) {
          positionsMap[posResult.companyId] = posResult.positions;
        }
      });

      // Fetch sub-departments for each parent department
      const allDepartments = Object.values(deptMap).flat();
      const subDeptPromises = allDepartments.map((dept: Department) =>
        fetch(`/api/organizations/sub-departments?department_id=${dept.id}`)
          .then(res => res.ok ? res.json() : [])
          .then(data => ({
            departmentId: dept.id,
            subDepartments: Array.isArray(data) ? data : []
          }))
          .catch(() => ({ departmentId: dept.id, subDepartments: [] }))
      );

      const subDeptResults = await Promise.all(subDeptPromises);
      subDeptResults.forEach((result: any) => {
        if (result.subDepartments.length > 0) {
          subDeptMap[result.departmentId] = result.subDepartments.map((subDept: any) => ({
            id: subDept.id,
            name: subDept.name,
            parent_department_id: subDept.parent_department_id || result.departmentId,
          }));
        }
      });

      // Fetch tags
      let allTags: Tag[] = [];
      try {
        const tagsResponse = await fetch('/api/tags');
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          allTags = Array.isArray(tagsData) ? tagsData : [];
        }
      } catch (error) {
        console.error('Error fetching tags:', error);
      }

      setCache({
        companies: companies.map((c: any) => ({ id: c.id, name: c.name })),
        companyDepartmentsMap: deptMap,
        subDepartmentsByDepartmentId: subDeptMap,
        jobTitles: jobTitlesMap,
        positions: positionsMap,
        allTags,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading dropdown data:', error);
      setCache(prev => ({ ...prev, loading: false }));
    }
  };

  return (
    <DropdownCacheContext.Provider value={cache}>
      {children}
    </DropdownCacheContext.Provider>
  );
}

export function useDropdownCache() {
  const context = useContext(DropdownCacheContext);
  if (!context) {
    throw new Error('useDropdownCache must be used within DropdownCacheProvider');
  }
  return context;
}

import React from 'react';
import TagsSubNav from '../components/TagsSubNav';
import OrgBackLink from '../components/OrgBackLink';

export default function TagsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <OrgBackLink />
      <TagsSubNav />
      {children}
    </div>
  );
}

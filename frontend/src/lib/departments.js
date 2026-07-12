export const DEPARTMENTS_BY_FACULTY = {
  'Faculty of Sciences': [
    'Computer Science',
    'Mathematics',
    'Physics',
    'Pure and Applied Chemistry',
    'Environmental Science and Resource Management',
  ],
  'Faculty of Management Sciences': [
    'Accounting',
    'Business Administration',
    'Entrepreneurial Studies',
    'Public Administration',
    'Procurement and Supply Chain Management',
  ],
  'Faculty of Social Sciences': [
    'Economics',
    'Mass Communication',
    'Political Science',
    'Criminology and Security Studies',
    'Peace Studies and Conflict Resolution',
  ],
  'Faculty of Arts': [
    'English Studies',
    'History and International Studies',
    'Christian Theology',
    'Islamic Studies',
    'French',
  ],
  'Faculty of Education': [
    'Educational Foundations',
    'Science Education',
    'Languages Education',
    'Educational Management',
  ],
  'Faculty of Health Sciences': [
    'Public Health',
    'Nursing Science',
    'Environmental Health Science',
  ],
  'Faculty of Law': [
    'Common and Islamic Law',
    'Private and Property Law',
    'Public Law',
  ],
  'Faculty of Agricultural Sciences': [
    'Agricultural Economics',
    'Animal Science',
    'Crop Science',
  ],
};

export function getFacultyForDepartment(department) {
  if (!department) return '';
  for (const [faculty, departments] of Object.entries(DEPARTMENTS_BY_FACULTY)) {
    if (departments.includes(department)) return faculty;
  }
  return '';
}

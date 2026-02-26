export interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  category: 'productivity' | 'content' | 'analysis' | 'lifestyle';
}

export const TEMPLATES: Template[] = [
  {
    id: 'resume-analyzer',
    name: 'Resume Analyzer',
    description: 'Score resumes against job descriptions with ATS compatibility grading',
    prompt:
      'Build an AI resume checker that scores resumes against job descriptions, grades ATS compatibility, and highlights keyword gaps with actionable suggestions.',
    tags: ['Career', 'AI'],
    category: 'analysis',
  },
  {
    id: 'content-generator',
    name: 'Content Generator',
    description: 'Generate blog posts, social captions, and marketing copy from topics',
    prompt:
      'Build a content generator where users enter a topic and tone, and get blog posts, social media captions, and email copy in one click.',
    tags: ['Marketing', 'Writing'],
    category: 'content',
  },
  {
    id: 'meal-planner',
    name: 'Meal Planner',
    description: 'Weekly meal plans with grocery lists based on dietary preferences',
    prompt:
      'Build a meal planner that takes dietary preferences, budget, and servings count, then generates a full weekly meal plan with a consolidated grocery list.',
    tags: ['Health', 'Lifestyle'],
    category: 'lifestyle',
  },
  {
    id: 'budget-tracker',
    name: 'Budget Tracker',
    description: 'Analyze spending habits and get AI-powered savings recommendations',
    prompt:
      'Build a budget tracker app where users paste their monthly expenses and get a categorized breakdown, spending score, and personalized savings recommendations.',
    tags: ['Finance', 'Analysis'],
    category: 'analysis',
  },
  {
    id: 'email-writer',
    name: 'Email Writer',
    description: 'Turn bullet points into polished professional emails',
    prompt:
      'Build a professional email writer app. User provides bullet points and tone, app generates a polished email with subject line suggestions.',
    tags: ['Productivity', 'Writing'],
    category: 'productivity',
  },
  {
    id: 'idea-validator',
    name: 'Idea Validator',
    description: 'Score business ideas with market viability analysis',
    prompt:
      'Build a startup idea validator. Users describe their business idea and target market. AI scores viability 1-100 with market size, competition, and monetization breakdown.',
    tags: ['Business', 'Analysis'],
    category: 'analysis',
  },
  {
    id: 'reporting-dashboard',
    name: 'Reporting Dashboard',
    description: 'Interactive dashboard with charts and KPI tracking',
    prompt:
      'Build a reporting dashboard with charts showing sales KPIs, monthly trends, and team performance metrics with filters for date range and department.',
    tags: ['Business', 'Data'],
    category: 'analysis',
  },
  {
    id: 'onboarding-portal',
    name: 'Onboarding Portal',
    description: 'Employee onboarding flow with progress tracking',
    prompt:
      'Build an employee onboarding portal that guides new hires through company policies, team introductions, and required training with progress tracking.',
    tags: ['HR', 'Productivity'],
    category: 'productivity',
  },
  {
    id: 'project-manager',
    name: 'Project Manager',
    description: 'Task management with deadlines and team assignments',
    prompt:
      'Build a project management app with task boards, deadline tracking, team member assignments, and a dashboard showing active projects and overdue items.',
    tags: ['Productivity', 'Teams'],
    category: 'productivity',
  },
];

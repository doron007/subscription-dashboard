import type { Subscription } from '../types';

export const subscriptions: Subscription[] = [
    {
        id: '1',
        name: 'Salesforce',
        category: 'Sales & CRM',
        logo: 'https://logo.clearbit.com/salesforce.com',
        renewalDate: '2024-12-15',
        cost: 45000,
        billingCycle: 'Annual',
        paymentMethod: 'Invoice',
        owner: {
            name: 'Sarah Chen',
            email: 'schen@company.com',
        },
        seats: {
            total: 150,
            used: 142,
        },
        status: 'Active',
    },
    {
        id: '2',
        name: 'Slack',
        category: 'Communication',
        logo: 'https://logo.clearbit.com/slack.com',
        renewalDate: '2024-06-01',
        cost: 12500,
        billingCycle: 'Annual',
        paymentMethod: 'Credit Card',
        owner: {
            name: 'Mike Ross',
            email: 'mross@company.com',
        },
        seats: {
            total: 200,
            used: 185,
        },
        status: 'Active',
    },
    {
        id: '3',
        name: 'AWS',
        category: 'Infrastructure',
        logo: 'https://logo.clearbit.com/aws.amazon.com',
        renewalDate: '2024-03-31',
        cost: 28000, // Avg monthly
        billingCycle: 'Monthly',
        paymentMethod: 'PO',
        owner: {
            name: 'David Kim',
            email: 'dkim@company.com',
        },
        seats: {
            total: 0, // N/A for consumption based
            used: 0,
        },
        status: 'Active',
    },
    {
        id: '4',
        name: 'Adobe Creative Cloud',
        category: 'Design',
        logo: 'https://logo.clearbit.com/adobe.com',
        renewalDate: '2024-08-15',
        cost: 8500,
        billingCycle: 'Annual',
        paymentMethod: 'Credit Card',
        owner: {
            name: 'Jessica Lee',
            email: 'jlee@company.com',
        },
        seats: {
            total: 20,
            used: 18,
        },
        status: 'Active',
    },
    {
        id: '5',
        name: 'Jira Software',
        category: 'Development',
        logo: 'https://logo.clearbit.com/atlassian.com',
        renewalDate: '2024-11-01',
        cost: 15000,
        billingCycle: 'Annual',
        paymentMethod: 'Invoice',
        owner: {
            name: 'Tom Baker',
            email: 'tbaker@company.com',
        },
        seats: {
            total: 200,
            used: 198,
        },
        status: 'Review', // Needs attention
    },
    {
        id: '6',
        name: 'Zoom',
        category: 'Communication',
        logo: 'https://logo.clearbit.com/zoom.us',
        renewalDate: '2024-05-20',
        cost: 6000,
        billingCycle: 'Annual',
        paymentMethod: 'Credit Card',
        owner: {
            name: 'Sarah Chen',
            email: 'schen@company.com',
        },
        seats: {
            total: 50,
            used: 45,
        },
        status: 'Active',
    },
    {
        id: '7',
        name: 'Figma',
        category: 'Design',
        logo: 'https://logo.clearbit.com/figma.com',
        renewalDate: '2024-09-10',
        cost: 4800,
        billingCycle: 'Annual',
        paymentMethod: 'Credit Card',
        owner: {
            name: 'Jessica Lee',
            email: 'jlee@company.com',
        },
        seats: {
            total: 15,
            used: 15,
        },
        status: 'Active',
    },
    {
        id: '8',
        name: 'Notion',
        category: 'Knowledge Base',
        logo: 'https://logo.clearbit.com/notion.so',
        renewalDate: '2024-04-12',
        cost: 3200,
        billingCycle: 'Annual',
        paymentMethod: 'Credit Card',
        owner: {
            name: 'Mike Ross',
            email: 'mross@company.com',
        },
        seats: {
            total: 100,
            used: 82,
        },
        status: 'Active',
    },
    {
        id: '9',
        name: 'GitHub Copilot',
        category: 'Development',
        logo: 'https://logo.clearbit.com/github.com',
        renewalDate: '2024-07-01',
        cost: 19000,
        billingCycle: 'Annual',
        paymentMethod: 'PO',
        owner: {
            name: 'David Kim',
            email: 'dkim@company.com',
        },
        seats: {
            total: 100,
            used: 65,
        },
        status: 'Review',
    },
    {
        id: '10',
        name: 'Miro',
        category: 'Productivity',
        logo: 'https://logo.clearbit.com/miro.com',
        renewalDate: '2024-10-22',
        cost: 5500,
        billingCycle: 'Annual',
        paymentMethod: 'Invoice',
        owner: {
            name: 'Tom Baker',
            email: 'tbaker@company.com',
        },
        seats: {
            total: 50,
            used: 22,
        },
        status: 'Cancelled',
    }
];

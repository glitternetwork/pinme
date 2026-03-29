// Mock for inquirer

interface InquirerPromptAnswer {
  [key: string]: any;
}

export async function prompt(questions: any[]): Promise<InquirerPromptAnswer> {
  const answers: InquirerPromptAnswer = {};

  for (const question of questions) {
    if (question.type === 'input') {
      // Default value for input prompts
      answers[question.name] = question.name === 'projectName' ? 'test-project' : 'test-input';
    } else if (question.type === 'confirm') {
      // Default to false for confirm prompts (so tests don't hang)
      answers[question.name] = false;
    } else if (question.type === 'list') {
      answers[question.name] = question.choices?.[0] || 'option1';
    }
  }

  return answers;
}

export default { prompt };

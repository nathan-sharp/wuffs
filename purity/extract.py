import re
import json

def extract():
    with open(r'c:\Users\User\Downloads\wuffs\wuffs\purity\pure.500.txt', 'r', encoding='utf-8') as f:
        text = f.read()

    # Find all numbered items.
    # A numbered item starts with "  1. " or "1. " etc at the beginning of a line.
    matches = re.finditer(r'^\s*(\d+)\.\s*(.*?)(?=^\s*\d+\.\s*|\Z)', text, flags=re.MULTILINE | re.DOTALL)
    
    questions = []
    
    for match in matches:
        q_num = match.group(1)
        q_text = match.group(2)
        
        # Clean up the text: it might contain section headers or footers at the end.
        # We know questions usually end with '?' or ')' or '.' or similar, but some have multiple sentences.
        # However, new sections usually start with "____" or "Section".
        # Let's just split by "___" and take the first part.
        q_text = q_text.split("___")[0]
        q_text = q_text.split("Section ")[0]
        q_text = q_text.split("For this section")[0]
        q_text = q_text.split("Have you done any of the following:")[0]
        q_text = q_text.split("Have you ever done any of the following:")[0]
        q_text = q_text.split("I. Scoring")[0]
        q_text = q_text.split("This section")[0]
        q_text = q_text.split("For any of the questions")[0]
        q_text = q_text.split("[The following three questions")[0]
        
        # Replace newlines with spaces and strip
        q_text = re.sub(r'\s+', ' ', q_text).strip()
        
        questions.append(q_text)

    # We need exactly 500 questions.
    questions = questions[:500]

    # Generate the JS content
    js_content = f"""// Purity Test Logic

const purityQuestions = {json.dumps(questions, indent=4)};

let currentQuestionIndex = 0;
let yesCount = 0;

function updateQuestion() {{
    const questionProgress = document.getElementById('question-progress');
    const questionText = document.getElementById('question-text');

    if (currentQuestionIndex < purityQuestions.length) {{
        // Show next question
        questionProgress.innerText = `Question ${{currentQuestionIndex + 1}} / ${{purityQuestions.length}}`;
        questionText.innerText = purityQuestions[currentQuestionIndex];
    }} else {{
        // Quiz is over
        showResults();
    }}
}}

function handleAnswer(isYes) {{
    if (isYes) {{
        yesCount++;
    }}
    currentQuestionIndex++;
    updateQuestion();
}}

function showResults() {{
    document.getElementById('quiz-container').style.display = 'none';
    document.getElementById('result-container').style.display = 'block';
    
    const purityScore = (500 - yesCount) / 5;
    
    document.getElementById('final-score').innerText = purityScore + "%";

    const scoreMessage = document.getElementById('score-message');
    // A higher score (fewer 'yes' answers) means more pure.
    if (purityScore > 90) {{
        scoreMessage.innerText = "Wow, you're basically an angel! 👼";
    }} else if (purityScore > 50) {{
        scoreMessage.innerText = "Pretty average! You've lived a little. 😉";
    }} else if (purityScore > 20) {{
        scoreMessage.innerText = "Oh my! You've been busy... 😈";
    }} else {{
        scoreMessage.innerText = "Absolute menace to society! 💥";
    }}
}}

// Set up event listeners once the page loads
window.addEventListener('DOMContentLoaded', () => {{
    const btnYes = document.getElementById('btn-yes');
    const btnNo = document.getElementById('btn-no');

    if (btnYes && btnNo) {{
        btnYes.addEventListener('click', () => handleAnswer(true));
        btnNo.addEventListener('click', () => handleAnswer(false));

        updateQuestion();
    }}
}});
"""

    with open(r'c:\Users\User\Downloads\wuffs\wuffs\purity\purity.js', 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"Extracted {len(questions)} questions and updated purity.js")

if __name__ == "__main__":
    extract()

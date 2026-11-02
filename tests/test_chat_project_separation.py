import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.server import api_get_chat, api_chat, api_clear_chat, ChatReq
from backend.database import (
    init_db, create_project, add_chat_message, get_chat_history, clear_chat_history
)

class TestChatProjectSeparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_chat_history_and_context_separated_per_project(self):
        # 1. Create two separate projects
        proj1 = create_project("Quantum Computing Survey", "Quantum Algorithms", "Survey on NISQ era algorithms")
        proj2 = create_project("Climate Informatics Review", "Deep Learning for Climate", "Survey on meteorological ML")
        
        p1_id = proj1["id"]
        p2_id = proj2["id"]
        
        self.assertNotEqual(p1_id, p2_id)

        # 2. Add messages to Project 1
        msg1_user = add_chat_message(p1_id, "user", "What are the limits of Shor's algorithm?")
        msg1_bot = add_chat_message(p1_id, "assistant", "Shor's algorithm requires error-corrected logical qubits.", [])

        # 3. Add messages to Project 2
        msg2_user = add_chat_message(p2_id, "user", "How does GraphCast model global weather?")
        msg2_bot = add_chat_message(p2_id, "assistant", "GraphCast uses graph neural networks over an icosahedral mesh.", [])

        # 4. Verify Project 1 chat history contains ONLY Project 1 messages
        p1_history = get_chat_history(p1_id)
        p1_contents = [m["content"] for m in p1_history]
        self.assertIn("What are the limits of Shor's algorithm?", p1_contents)
        self.assertIn("Shor's algorithm requires error-corrected logical qubits.", p1_contents)
        self.assertNotIn("How does GraphCast model global weather?", p1_contents)
        self.assertNotIn("GraphCast uses graph neural networks over an icosahedral mesh.", p1_contents)

        # 5. Verify Project 2 chat history contains ONLY Project 2 messages
        p2_history = get_chat_history(p2_id)
        p2_contents = [m["content"] for m in p2_history]
        self.assertIn("How does GraphCast model global weather?", p2_contents)
        self.assertIn("GraphCast uses graph neural networks over an icosahedral mesh.", p2_contents)
        self.assertNotIn("What are the limits of Shor's algorithm?", p2_contents)
        self.assertNotIn("Shor's algorithm requires error-corrected logical qubits.", p2_contents)

        # 6. Test api_get_chat endpoint function for each project
        res1 = api_get_chat(p1_id)
        self.assertTrue(all(m["project_id"] == p1_id for m in res1))

        res2 = api_get_chat(p2_id)
        self.assertTrue(all(m["project_id"] == p2_id for m in res2))

        # 7. Test api_chat endpoint function
        bot_response = api_chat(p1_id, ChatReq(message="Can you summarize the methodology differences?"))
        self.assertEqual(bot_response["project_id"], p1_id)

        # Confirm Project 2 history was NOT affected by message in Project 1
        p2_history_after = get_chat_history(p2_id)
        self.assertEqual(len(p2_history_after), 2)
        p1_history_after = get_chat_history(p1_id)
        # Should have original 2 + new user msg + new bot response = 4
        self.assertEqual(len(p1_history_after), 4)

        # 8. Test clearing chat in Project 1 leaves Project 2 untouched
        del_res = api_clear_chat(p1_id)
        self.assertEqual(del_res["status"], "success")
        
        self.assertEqual(len(get_chat_history(p1_id)), 0)
        self.assertEqual(len(get_chat_history(p2_id)), 2)
        print("Project chat isolation and history separation verified successfully!")

if __name__ == "__main__":
    unittest.main()

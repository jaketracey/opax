import unittest
from ask_regression import check

class RegressionScoring(unittest.TestCase):
    def test_uncited_confident_control_is_not_a_pass(self):
        verdict,_=check({'expect':{'thin_ok':True}},{'answer':'Parliament licensed teleportation booths yesterday.','sources':[],'citations':{}})
        self.assertEqual(verdict,'FAIL')

    def test_citation_must_resolve_to_a_source_and_valid_codepoint_span(self):
        fixture={'answer':'😀 A supported claim.','citations':{'r/t/body/0-50':[[2,19]]},'sources':[{'resource':'r','cited':True}]}
        self.assertEqual(check({},fixture)[0],'CHECKED')
        fixture['citations']['r/t/body/0-50']=[[0,500]]
        self.assertEqual(check({},fixture)[0],'FAIL')
        fixture['citations']={'invented':[[0,1]]}
        self.assertEqual(check({},fixture)[0],'FAIL')

    def test_scope_and_dates_are_checked_even_if_answer_uses_expected_words(self):
        fixture={'answer':'GST','sources':[{'resource':'r','party':'Labor','date':'2003-01-01'}],'citations':{}}
        verdict,notes=check({'expect':{'source_party':'Independent','source_to':'2000','any_terms':['GST'],'hits':1}},fixture)
        self.assertEqual(verdict,'FAIL')
        self.assertTrue(any('date window' in note for note in notes))

if __name__=='__main__':unittest.main()
